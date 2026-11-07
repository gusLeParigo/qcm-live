const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Code PIN pour protéger la télécommande Admin (modifiable ici ou via variable d'environnement)
const ADMIN_PIN = process.env.ADMIN_PIN || "1234";

let questions = [
    {
        text: "Quel est le meilleur langage pour un script rapide ?",
        options: ["Python", "JavaScript", "Bash", "Go"]
    },
    {
        text: "Quelle est la pire heure pour une réunion ?",
        options: ["Lundi 8h30", "Vendredi 17h30", "Juste avant manger (12h15)", "Toutes les réponses"]
    }
];

let state = {
    currentQuestionIndex: 0,
    votes: [0, 0, 0, 0],
    isLocked: false,
    showResults: false,
    roundId: Date.now() // Permet de débloquer les téléphones si on réinitialise les votes
};

function resetVotesForCurrentQuestion() {
    const q = questions[state.currentQuestionIndex];
    state.votes = new Array(q.options.length).fill(0);
    state.isLocked = false;
    state.showResults = false;
    state.roundId = Date.now();
}

function getFullState() {
    return {
        question: questions[state.currentQuestionIndex],
        questionIndex: state.currentQuestionIndex,
        totalQuestions: questions.length,
        votes: state.votes,
        totalVotes: state.votes.reduce((a, b) => a + b, 0),
        isLocked: state.isLocked,
        showResults: state.showResults,
        roundId: state.roundId
    };
}

io.on('connection', (socket) => {
    socket.emit('stateUpdate', getFullState());

    // Réception d'un vote
    socket.on('castVote', (optionIndex) => {
        if (state.isLocked) return;
        if (optionIndex >= 0 && optionIndex < state.votes.length) {
            state.votes[optionIndex]++;
            io.emit('stateUpdate', getFullState());
        }
    });

    // Actions Admin sécurisées par PIN
    socket.on('adminAction', ({ pin, action, payload }) => {
        if (pin !== ADMIN_PIN) {
            socket.emit('adminAuthError', 'Code PIN incorrect');
            return;
        }

        if (action === 'toggleLock') {
            state.isLocked = !state.isLocked;
        } else if (action === 'toggleResults') {
            state.showResults = !state.showResults;
            if (state.showResults) state.isLocked = true;
        } else if (action === 'nextQuestion') {
            if (state.currentQuestionIndex < questions.length - 1) {
                state.currentQuestionIndex++;
                resetVotesForCurrentQuestion();
            }
        } else if (action === 'prevQuestion') {
            if (state.currentQuestionIndex > 0) {
                state.currentQuestionIndex--;
                resetVotesForCurrentQuestion();
            }
        } else if (action === 'resetVotes') {
            resetVotesForCurrentQuestion();
        } else if (action === 'addQuestion' && payload) {
            questions.push({
                text: payload.text,
                options: payload.options
            });
            state.currentQuestionIndex = questions.length - 1;
            resetVotesForCurrentQuestion();
        } else if (action === 'deleteCurrentQuestion') {
            if (questions.length > 1) {
                questions.splice(state.currentQuestionIndex, 1);
                if (state.currentQuestionIndex >= questions.length) {
                    state.currentQuestionIndex = questions.length - 1;
                }
                resetVotesForCurrentQuestion();
            }
        }

        io.emit('stateUpdate', getFullState());
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur actif sur le port ${PORT}`);
});