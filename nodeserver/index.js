const io = require('socket.io')(process.env.PORT || 'http://localhost:8000', {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const users = {}; // Initialize an empty object to store user data


// Authentication function (replace with your actual authentication logic)
function authenticateUser(username, password) {
    // Dummy authentication logic (replace with your actual authentication logic)
    const users = {
        "user1": "password1",
        "user2": "password2"
    };
    return users[username] === password;
}

// Encryption functions
const forge = require('node-forge');

function generateRSAKeyPair() {
    const keys = forge.pki.rsa.generateKeyPair({ bits: 2048 });
    const publicKey = forge.pki.publicKeyToPem(keys.publicKey);
    const privateKey = forge.pki.privateKeyToPem(keys.privateKey);
    return { publicKey, privateKey };
}

function encryptMessage(message, publicKey) {
    const publicKeyObj = forge.pki.publicKeyFromPem(publicKey);
    const encrypted = publicKeyObj.encrypt(message, 'RSA-OAEP');
    return forge.util.encode64(encrypted);
}

function decryptMessage(encryptedData, privateKey) {
    const decrypted = forge.pki.privateKeyFromPem(privateKey).decrypt(forge.util.decode64(encryptedData), 'RSA-OAEP');
    return decrypted;
}

// Main code

const { publicKey: GpublicKey, privateKey: GprivateKey } = generateRSAKeyPair();

//a new connection is formed
io.on('connection', socket => {
    socket.on('login', ({ username, password }) => {
        // Authenticate user
        if (authenticateUser(username, password)) {
            // If authentication is successful, store user information in socket session
            socket.username = username;

            // Send success signal to client
            socket.emit('login-success');
        } else {
            // If authentication fails, send failure signal to client
            socket.emit('login-fail');
        }
    });

    // New user joined the chat
socket.on('new-user-joined', data => {
    const { name, publicKey } = data;
    users[socket.id] = { name, publicKey };
    console.log(users[socket.id].name);

    // Broadcast to others (excluding the current socket)
    socket.broadcast.emit('user-joined', name);

    // Send group public key to the user
    io.to(socket.id).emit('Grouppk', GpublicKey);
});


    // User has sent a message to the server
    socket.on('send', encryptedData => {
        try {
            // Decrypt user's data
            const decryptedData = decryptMessage(encryptedData, GprivateKey);
            const { message, senderName } = JSON.parse(decryptedData);
            console.log('Decrypted message:', message);
            console.log('Sender name:', senderName);

            // Broadcast the decrypted message and sender's name to everyone in the group chat
            Object.keys(users).forEach(socketId => {
                // Skip sending the message to the sender
                if (socketId !== socket.id) {
                    const userPublicKey = users[socketId].publicKey;
                    // Encrypt user's data with recipient's public key
                    const encryptedData = encryptMessage(JSON.stringify({ message, senderName }), userPublicKey);
                    io.to(socketId).emit('receive', encryptedData);
                }
            });
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    socket.on('disconnect', () => {
        if (users[socket.id]) {
            socket.broadcast.emit('left', users[socket.id].name);
            delete users[socket.id];
        }
    });
});
