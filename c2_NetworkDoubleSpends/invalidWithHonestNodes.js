var EthCrypto = require('eth-crypto')
var network = require('./networksim')()

function getTxHash (tx) {
  return EthCrypto.hash.keccak256(JSON.stringify(tx))
}

// class InvalidNonce extends Error {
//   constructor (...args) {
//     super(...args)
//     Error.captureStackTrace(this, InvalidNonce)
//   }
// }

class Node {
  constructor (wallet, genesis, network) {
    // Blockchain identity
    this.wallet = wallet
    // P2P Node identity -- used for connecting to peers
    this.p2pNodeId = EthCrypto.createIdentity()
    this.pid = this.p2pNodeId.address
    this.network = network
    this.state = genesis
    this.transactions = []
    this.invalidNonceTxs = {}
  }

  onReceive (tx) {
    if (this.transactions.includes(tx)) {
      return
    }
    this.transactions.push(tx)
    this.applyTransaction(tx)
    this.network.broadcast(this.pid, tx)
    this.applyInvalidNonceTxs(tx.contents.from)
  }

  applyInvalidNonceTxs (address) {
    const targetNonce = this.state[address].nonce
    if (address in this.invalidNonceTxs && targetNonce in this.invalidNonceTxs[address]) {
      this.applyTransaction(this.invalidNonceTxs[address][targetNonce])
      delete this.invalidNonceTxs[address][targetNonce]
      this.applyInvalidNonceTxs(address)
    }
  }

  tick () {
    // If we have no money, don't do anything!
    if (this.state[this.wallet.address].balance < 10) {
      console.log('We are honest so we wont send anything :)')
      return
    }
    // Generate random transaction
    const unsignedTx = {
      type: 'send',
      amount: 10,
      from: this.wallet.address,
      to: nodes[Math.floor(Math.random() * nodes.length)].wallet.address,
      nonce: this.state[this.wallet.address].nonce
    }
    const tx = {
      contents: unsignedTx,
      sig: EthCrypto.sign(this.wallet.privateKey, getTxHash(unsignedTx))
    }
    this.transactions.push(tx)
    this.applyTransaction(tx)
    // Broadcast this tx to the network
    this.network.broadcast(this.pid, tx)
  }

  applyTransaction (tx) {
    // Check the from address matches the signature
    const signer = EthCrypto.recover(tx.sig, getTxHash(tx.contents))
    if (signer !== tx.contents.from) {
      throw new Error('Invalid signature!')
    }
    // If we don't have a record for this address, create one
    if (!(tx.contents.to in this.state)) {
      this.state[[tx.contents.to]] = {
        balance: 0,
        nonce: 0
      }
    }
    // Check that the nonce is correct for replay protection
    if (tx.contents.nonce !== this.state[[tx.contents.from]].nonce) {
      // If it isn't correct, then we should add it to transaction to invalidNonceTxs
      if (!(tx.contents.from in this.invalidNonceTxs)) {
        this.invalidNonceTxs[tx.contents.from] = {}
      }
      this.invalidNonceTxs[tx.contents.from][tx.contents.nonce] = tx
      return
    }
    if (tx.contents.type === 'send') { // Send coins
      if (this.state[[tx.contents.from]].balance - tx.contents.amount < 0) {
        throw new Error('Not enough money!')
      }
      this.state[[tx.contents.from]].balance -= tx.contents.amount
      this.state[[tx.contents.to]].balance += tx.contents.amount
    } else {
      throw new Error('Invalid transaction type!')
    }
    this.state[[tx.contents.from]].nonce += 1
  }
}

// ****** Test this out using a simulated network ****** //
const numNodes = 5
const wallets = []
const genesis = {}
for (let i = 0; i < numNodes; i++) {
  // Create new identity
  wallets.push(EthCrypto.createIdentity())
  // Add that node to our genesis block & give them an allocation
  genesis[wallets[i].address] = {
    balance: 100,
    nonce: 0
  }
}
const nodes = []
// Create new nodes based on our wallets, and connect them to the network
for (let i = 0; i < numNodes; i++) {
  nodes.push(new Node(wallets[i], JSON.parse(JSON.stringify(genesis)), network))
  network.connectPeer(nodes[i], 2)
}

try {
  network.run(300)
} catch (e) {
  console.log('One of our honest nodes had a transaction fail because of network latency!')
  // console.log(e)
  console.log('~~~~~~~~~~~ Node 0 ~~~~~~~~~~~')
  console.log(nodes[0].state)
  console.log('~~~~~~~~~~~ Node 1 ~~~~~~~~~~~')
  console.log(nodes[1].state)
  console.log('~~~~~~~~~~~ Node 1 ~~~~~~~~~~~')
  console.log(nodes[1].invalidNonceTxs[wallets[0].address])
}
