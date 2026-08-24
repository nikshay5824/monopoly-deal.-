const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Serve the frontend static HTML files cleanly
app.use(express.static(__dirname));

let connectedPlayers = []; // Tracks socket IDs
let gameState = {
    deck: [],
    discardPile: [],
    activePlayerIndex: 0,
    actionsRemaining: 3,
    players: [
        { id: 1, label: "PLAYER 1", socketId: null, hand: [], bank: [], properties: {} },
        { id: 2, label: "PLAYER 2", socketId: null, hand: [], bank: [], properties: {} },
        { id: 3, label: "PLAYER 3", socketId: null, hand: [], bank: [], properties: {} },
        { id: 4, label: "PLAYER 4", socketId: null, hand: [], bank: [], properties: {} }
    ]
};

const CARD_TYPES = { PROP: 'PROPERTY', MONEY: 'MONEY', ACTION: 'ACTION', RENT: 'RENT' };
const COLORS = {
    BROWN: { name: 'Brown', req: 2, hex: '#8B4513' },
    LIGHTBLUE: { name: 'Light Blue', req: 3, hex: '#87CEEB' },
    PINK: { name: 'Pink', req: 3, hex: '#FF69B4' },
    ORANGE: { name: 'Orange', req: 3, hex: '#FFA500' },
    RED: { name: 'Red', req: 3, hex: '#E74C3C' },
    YELLOW: { name: 'Yellow', req: 3, hex: '#F1C40F' },
    GREEN: { name: 'Green', req: 3, hex: '#27AE60' },
    BLUE: { name: 'Blue', req: 2, hex: '#2980B9' },
    RAILROAD: { name: 'Railroad', req: 4, hex: '#2C3E50' },
    UTILITY: { name: 'Utility', req: 2, hex: '#7F8C8D' }
};

// Base 110-card deck configuration matrix
const CARD_TEMPLATES = [
    { type: CARD_TYPES.PROP, title: 'Old Kent Road', color: COLORS.BROWN, value: 1 },
    { type: CARD_TYPES.PROP, title: 'Whitechapel Road', color: COLORS.BROWN, value: 1 },
    { type: CARD_TYPES.PROP, title: 'The Angel Islington', color: COLORS.LIGHTBLUE, value: 1 },
    { type: CARD_TYPES.PROP, title: 'Euston Road', color: COLORS.LIGHTBLUE, value: 1 },
    { type: CARD_TYPES.PROP, title: 'Pentonville Road', color: COLORS.LIGHTBLUE, value: 1 },
    { type: CARD_TYPES.PROP, title: 'Pall Mall', color: COLORS.PINK, value: 2 },
    { type: CARD_TYPES.PROP, title: 'Whitehall', color: COLORS.PINK, value: 2 },
    { type: CARD_TYPES.PROP, title: 'Northumberland Ave', color: COLORS.PINK, value: 2 },
    { type: CARD_TYPES.PROP, title: 'Bow Street', color: COLORS.ORANGE, value: 2 },
    { type: CARD_TYPES.PROP, title: 'Marlborough St', color: COLORS.ORANGE, value: 2 },
    { type: CARD_TYPES.PROP, title: 'Vine Street', color: COLORS.ORANGE, value: 2 },
    { type: CARD_TYPES.PROP, title: 'Strand', color: COLORS.RED, value: 3 },
    { type: CARD_TYPES.PROP, title: 'Fleet Street', color: COLORS.RED, value: 3 },
    { type: CARD_TYPES.PROP, title: 'Trafalgar Square', color: COLORS.RED, value: 3 },
    { type: CARD_TYPES.PROP, title: 'Leicester Square', color: COLORS.YELLOW, value: 3 },
    { type: CARD_TYPES.PROP, title: 'Coventry Street', color: COLORS.YELLOW, value: 3 },
    { type: CARD_TYPES.PROP, title: 'Piccadilly', color: COLORS.YELLOW, value: 3 },
    { type: CARD_TYPES.PROP, title: 'Regent Street', color: COLORS.GREEN, value: 4 },
    { type: CARD_TYPES.PROP, title: 'Oxford Street', color: COLORS.GREEN, value: 4 },
    { type: CARD_TYPES.PROP, title: 'Bond Street', color: COLORS.GREEN, value: 4 },
    { type: CARD_TYPES.PROP, title: 'Park Lane', color: COLORS.BLUE, value: 4 },
    { type: CARD_TYPES.PROP, title: 'Mayfair', color: COLORS.BLUE, value: 4 },
    { type: CARD_TYPES.PROP, title: 'Kings Cross', color: COLORS.RAILROAD, value: 2 },
    { type: CARD_TYPES.PROP, title: 'Marylebone', color: COLORS.RAILROAD, value: 2 },
    { type: CARD_TYPES.PROP, title: 'Fenchurch St', color: COLORS.RAILROAD, value: 2 },
    { type: CARD_TYPES.PROP, title: 'Electric Company', color: COLORS.UTILITY, value: 2 },
    { type: CARD_TYPES.PROP, title: 'Water Works', color: COLORS.UTILITY, value: 2 },
    { type: CARD_TYPES.ACTION, title: 'Deal Breaker', value: 5, desc: 'Steal a completed set.' },
    { type: CARD_TYPES.ACTION, title: 'Debt Collector', value: 3, desc: 'Demand 5M from any player.' },
    { type: CARD_TYPES.ACTION, title: 'Sly Deal', value: 3, desc: 'Steal a single uncompleted property.' },
    { type: CARD_TYPES.ACTION, title: 'It\'s My Birthday', value: 2, desc: 'Collect 2M from everyone.' },
    { type: CARD_TYPES.ACTION, title: 'Pass Go', value: 1, desc: 'Draw 2 extra cards.' },
    { type: CARD_TYPES.RENT, title: 'Wild Rent', value: 3, desc: 'Charge rent on any set.' },
    { type: CARD_TYPES.MONEY, title: '5M Note', value: 5 },
    { type: CARD_TYPES.MONEY, title: '4M Note', value: 4 },
    { type: CARD_TYPES.MONEY, title: '3M Note', value: 3 },
    { type: CARD_TYPES.MONEY, title: '2M Note', value: 2 },
    { type: CARD_TYPES.MONEY, title: '1M Note', value: 1 }
];

function initBuildDeck() {
    let pool = [];
    let id = 0;
    for (let i = 0; i < 3; i++) { // 3 sets mixed to confidently support a 4-player cross-device session
        CARD_TEMPLATES.forEach(t => pool.push({ ...t, id: id++ }));
    }
    gameState.deck = shuffle(pool);
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function dealCards(playerIdx, count) {
    for (let i = 0; i < count; i++) {
        if (gameState.deck.length === 0) {
            gameState.deck = shuffle([...gameState.discardPile]);
            gameState.discardPile = [];
        }
        if(gameState.deck.length > 0) {
            gameState.players[playerIdx].hand.push(gameState.deck.pop());
        }
    }
}

initBuildDeck();
gameState.players.forEach((p, idx) => {
    Object.keys(COLORS).forEach(c => p.properties[c] = []);
    dealCards(idx, 5); // Deal 5 cards initially
});

io.on('connection', (socket) => {
    console.log(`Device connected: ${socket.id}`);

    // Assign slot out of the 4 open slots
    let playerSlot = gameState.players.find(p => p.socketId === null);
    
    if (playerSlot) {
        playerSlot.socketId = socket.id;
        socket.emit('assignPlayer', { playerNumber: playerSlot.id });
        io.emit('log', `Player ${playerSlot.id} joined from a device.`);
    } else {
        socket.emit('assignPlayer', { playerNumber: 0 }); // Spectator mode if room full
    }

    // Sync state to newly connected client device
    io.emit('stateUpdate', sanitizeState());

    socket.on('drawPhase', (pNum) => {
        let idx = pNum - 1;
        if(gameState.activePlayerIndex !== idx) return;
        
        let count = gameState.players[idx].hand.length === 0 ? 5 : 2;
        dealCards(idx, count);
        io.emit('log', `Player ${pNum} drew ${count} cards.`);
        io.emit('stateUpdate', sanitizeState());
    });

    socket.on('playCard', ({ pNum, cardId, destination }) => {
        let idx = pNum - 1;
        if (gameState.activePlayerIndex !== idx || gameState.actionsRemaining <= 0) return;

        let hand = gameState.players[idx].hand;
        let cardIdx = hand.findIndex(c => c.id === cardId);
        if (cardIdx === -1) return;

        let card = hand.splice(cardIdx, 1)[0];

        if (destination === 'bank') {
            gameState.players[idx].bank.push(card);
            io.emit('log', `Player ${pNum} deposited ${card.title} into their bank.`);
        } else if (destination === 'property' && card.type === CARD_TYPES.PROP) {
            let colKey = card.color.name.toUpperCase().replace(" ", "");
            gameState.players[idx].properties[colKey].push(card);
            io.emit('log', `Player ${pNum} placed property asset: ${card.title}.`);
        } else {
            gameState.discardPile.push(card);
            io.emit('log', `Player ${pNum} played Action: ${card.title}.`);
        }

        gameState.actionsRemaining--;
        io.emit('stateUpdate', sanitizeState());
    });

    socket.on('endTurn', (pNum) => {
        let idx = pNum - 1;
        if (gameState.activePlayerIndex !== idx) return;

        if (gameState.players[idx].hand.length > 7) {
            socket.emit('err', "Cannot end turn with more than 7 cards! Please discard down.");
            return;
        }

        gameState.activePlayerIndex = (gameState.activePlayerIndex + 1) % 4;
        gameState.actionsRemaining = 3;
        io.emit('log', `Turn passed to Player ${gameState.activePlayerIndex + 1}.`);
        io.emit('stateUpdate', sanitizeState());
    });

    socket.on('disconnect', () => {
        let p = gameState.players.find(p => p.socketId === socket.id);
        if (p) {
            io.emit('log', `Player ${p.id} left the game session.`);
            p.socketId = null; // Free up slot for reconnection
        }
    });
});

// Clears tracking identifiers before broadcasting across client interfaces
function sanitizeState() {
    return {
        discardPile: gameState.discardPile,
        activePlayerIndex: gameState.activePlayerIndex,
        actionsRemaining: gameState.actionsRemaining,
        players: gameState.players.map(p => ({
            id: p.id,
            label: p.label,
            bank: p.bank,
            properties: p.properties,
            handCount: p.hand.length,
            // Only broadcast raw hand content dynamically on the interface side via private loops
            rawHand: p.hand 
        }))
    };
}

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Monopoly Deal Server running! Access on devices at: http://YOUR_COMPUTER_IP:${PORT}`);
});
