require("dotenv").config();
var Web3 = require("web3");

const alchemyPolygonLink = `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`;

var web3 = new Web3(new Web3.providers.HttpProvider(alchemyPolygonLink));

const contractAbi = require('./UniswapNFTPositionManagerAbi.json');

const uniswapPositionManagerContractAddress = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const contract = new web3.eth.Contract(contractAbi, uniswapPositionManagerContractAddress);
const instaContractAddress = '0x575D9121127bEc262Bc920F465d60A9418A63744';
let finalTransactions;

const getEvents = async (fromBlock) => {
    const transactionHashes = new Set();

    await contract.getPastEvents("IncreaseLiquidity",
        { fromBlock: 25698992, toBlock: 25774738 },
        (err, events) => {
            for (let i = 0; i < events.length; i++) {
                // console.log(events[i].transactionHash);
                transactionHashes.add(events[i].transactionHash);
            }
            // console.log(events[0]);
            // transactionHash = events[0].transactionHash;
        });

    events = await contract.getPastEvents("DecreaseLiquidity",
        { fromBlock: 25698992, toBlock: 25774738 }
    );

    // console.log(events);
    const instaTransactionHashes = events.map(e => {
        return {
            transactionHash: e.transactionHash,
            tokenId: e.returnValues.tokenId,
            liquidity: e.returnValues.liquidity
        };
    }).filter(transaction => transactionHashes.has(transaction.transactionHash));
    // console.log(instaTransactionHashes);

    finalTransactions = await Promise.all(instaTransactionHashes.map(async (transaction) => {
        const result = await web3.eth.getTransaction(transaction.transactionHash);
        return {
            tokenId: transaction.tokenId,
            liquidity: transaction.liquidity,
            to: result.to,
            from: result.from,
            hash: result.hash
        }
    }));

    // console.log(finalTransactions);

    const idappTransactions = finalTransactions.filter(transaction => transaction.to.toLowerCase() === instaContractAddress.toLowerCase())
    console.log(idappTransactions);
    
    const users = new Set();
    const tokenPools = new Set();
    let totalLiquidityRebalanced = 0;

    idappTransactions.forEach(transaction => {
        tokenPools.add(transaction.tokenId);
        users.add(transaction.from);
        totalLiquidityRebalanced += Number(transaction.liquidity);
    })

    console.log("Users: ", users);
    console.log("No. of unique users: ", users.size);
    console.log("Token Pools: ", tokenPools);
    console.log("Total Liquidity rebalanced: ", totalLiquidityRebalanced)
}


getEvents();
