const _ = require('lodash')
const Web3 = require('web3')
const Web3c = require('web3c')
const minimist = require('minimist')
const { GameServer, Game } = require('oasis-game-client')

const GameServerContract = artifacts.require('GameServerContract')
const web3c = new Web3c(GameServerContract.web3.currentProvider)

const truffleConfig = require('../truffle-config.js')
let args = minimist(process.argv.slice(2), {
  boolean: ['confidential'],
  default: {
    confidential: true
  }
})
let networkConfig = truffleConfig.config[args.network || 'development']
let eventsWeb3c = new Web3c(new Web3.providers.WebsocketProvider(networkConfig.wsEndpoint))
let confidential = args.confidential

async function delay (ms) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve()
    }, ms)
  })
}

async function alternateMoves(games, boardSize) {
  for (let x = 0; x < boardSize; x++) {
    for (let y = 0; y < boardSize; y++) {
      for (let { game, player } of games) {
        console.log(`Clicking tile (${x},${y}) for Player ${player}`)
         await game.sendAction({
          MakeMove: {
            move_type: 'click_tile',
            player_id: player,
            args: [x, y]
          }
         })
        let state = await game.getLastState()
        let gameover = state.ctx.gameover
        if (gameover) return gameover
      }
    }
  }
}

contract('GameServerContract', async (accounts) => {

  it('should create a new game', async () => {
    let server = new GameServer(GameServerContract.address, {
      web3c,
      eventsWeb3c,
      account: 0,
      confidential
    })
    let game = await server.createGame([
      {
        address: accounts[0],
        is_bot: false
      },
      {
        address: accounts[1],
        is_bot: false
      }
    ])

    assert.equal(game.id, 1)
    await game.ready()

    let players = await game.getRegisteredPlayers()

    assert.deepEqual(players[accounts[0].toLowerCase()].map(p => p.id), [1])
    assert.deepEqual(players[accounts[1].toLowerCase()].map(p => p.id), [2])
  })

  it('should allow both players to signal readiness', async () => {
    let server1 = new GameServer(GameServerContract.address, {
      web3c,
      eventsWeb3c,
      account: 0,
      confidential
    })
    let server2 = new GameServer(GameServerContract.address, {
      web3c,
      eventsWeb3c,
      account: 1,
      confidential
    })

    let game1 = await server1.createGame([
      {
        address: accounts[0],
        is_bot: false
      },
      {
        address: accounts[1],
        is_bot: false
      }
    ])
    await game1.ready()

    let game2 = new Game(server2, game1.id)

    await game1.sendReady()
    await game2.sendReady()
  
    await delay(1000)

    assert.equal(game1.isStarted, true)
    assert.equal(game2.isStarted, true)
  })

  it('should complete a game', async () => {
    let server1 = new GameServer(GameServerContract.address, {
      web3c,
      eventsWeb3c,
      account: 0,
      confidential
    })
    let server2 = new GameServer(GameServerContract.address, {
      web3c,
      eventsWeb3c,
      account: 1,
      confidential
    })

    let game1 = await server1.createGame([
      {
        address: accounts[0],
        is_bot: false
      },
      {
        address: accounts[1],
        is_bot: false
      }
    ])
    await game1.ready()

    let game2 = new Game(server2, game1.id)

    await game1.sendReady()
    await game2.sendReady()

    // Alternate moves until victory.
    let gameover = await alternateMoves([{
      game: game1,
      player: 1,
    }, {
      game: game2,
      player: 2
    }], 10)

    assert.ok(gameover)
  })
})
