# NFT Messenger

NFT Messenger is a decentralized messaging application that leverages the power of blockchain technology to provide a secure and user-centric communication platform. Each message is minted as an NFT, giving users true ownership of their conversations. The application uses IPFS for decentralized storage, ensuring that your data is always available and resistant to censorship.

## Table of Contents

- [Features](#features)
- [Technologies](#technologies)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage](#usage)
  - [Running the Frontend](#running-the-frontend)
  - [Running the Backend](#running-the-backend)
- [Contracts](#contracts)

## Features

- **Decentralized Messaging**: Messages are stored on IPFS, a peer-to-peer network for storing and sharing data.
- **NFT Ownership**: Each message is an NFT, which means you have full control and ownership of your conversations.
- **Secure and Private**: Communications are secured by the underlying blockchain technology.
- **Web3 Integration**: Seamlessly connect your Ethereum wallet to interact with the application.

## Technologies

This project is built with a modern technology stack:

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, ethers.js
- **Backend**: Node.js, Express, TypeScript, IPFS
- **Blockchain**: Solidity, Hardhat, Ethereum

## Getting Started

Follow these instructions to get a local copy of the project up and running.

### Prerequisites

- [Node.js](https://nodejs.org/)
- [npm](https://www.npmjs.com/)
- An Ethereum wallet (e.g., MetaMask)

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-username/nft-messenger.git
   cd nft-messenger
   ```

2. **Install frontend dependencies:**

   ```bash
   cd frontend
   npm install
   ```

3. **Install backend dependencies:**

   ```bash
   cd ../backend
   npm install
   ```

## Usage

### Running the Frontend

From the `frontend` directory, run the following command to start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

### Running the Backend

From the `backend` directory, run the following command:

```bash
npm run dev
```

The backend server will start on `http://localhost:3000`.

## Contracts

The Solidity smart contracts are located in the `contracts` directory. You can deploy and interact with them using a development environment like Hardhat.
