const Web3 = require("web3");
require("dotenv").config();
const convertLiquidityToTokens = require("./helpers");
const { getDsaAccounts } = require("./getDsaAccounts");

const alchemyPolygonLink = `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`;

var web3 = new Web3(new Web3.providers.HttpProvider(alchemyPolygonLink));

const contractAbi = require('./UniswapNFTPositionManagerAbi.json');

const uniswapPositionManagerContractAddress = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const contract = new web3.eth.Contract(contractAbi, uniswapPositionManagerContractAddress);
let transactionData;

const getEvents = async (dsaAccounts) => {
    // store all transaction hashes obtained from IncreaseLiquidity event emits in a set for quick search later on
    const transactionHashes = new Map();

    let latestBlock = await web3.eth.getBlockNumber(); // get the latest block number
    let allValidTransactions = [];
    let currentToBlock;

    for (let currentFirstBlock = 25657968; currentFirstBlock < latestBlock; currentFirstBlock = currentToBlock + 1) {
        currentToBlock = Math.min(latestBlock, currentFirstBlock + 3000);
        // get past events of type IncreaseLiquidity between currentFirstBlock and currentToBlock block numbers from Uniswap contract
        await contract.getPastEvents("IncreaseLiquidity",
            { fromBlock: currentFirstBlock, toBlock: currentToBlock },
            (err, events) => {
                // push the transaction hash of all emitted events into the set
                for (let i = 0; i < events.length; i++) {
                    transactionHashes.set(events[i].transactionHash, events[i].returnValues.tokenId);
                }
            });

        // get past events of type DecreaseLiquidity between currentFirstBlock and currentToBlock block numbers
        events = await contract.getPastEvents("DecreaseLiquidity",
            { fromBlock: currentFirstBlock, toBlock: currentToBlock }
        );

        // filter out transaction hashes between the current block range that emitted both IncreaseLiquidity and DecreaseLiquidity events
        // also filter according to the condition that the tokenIds for IncreaseLiquidity and DecreaseLiquidity events must be different
        const validTransactionInRange = events
            .filter(transaction => (transactionHashes.has(transaction.transactionHash) && transaction.returnValues.tokenId !== transactionHashes.get(transaction.transactionHash)))
            .map(e => {
                return {
                    newTokenId: transactionHashes.get(e.transactionHash),
                    oldTokenId: e.returnValues.tokenId,
                    transactionHash: e.transactionHash,
                    liquidityRebalanced: e.returnValues.liquidity
                };
            })
        // append the list for current block range into the overall list
        allValidTransactions = allValidTransactions.concat(validTransactionInRange);
    }

    // get transaction data of each transaction hash obtained above 
    let totalLiquidityRebalancedInUsd = 0;

    transactionData = await Promise.all(allValidTransactions.map(async (transaction) => {
        const result = await web3.eth.getTransaction(transaction.transactionHash);
        return {
            newTokenId: transaction.newTokenId,
            oldTokenId: transaction.oldTokenId,
            dsaAddr: result.to,
            transactionHash: result.hash,
            liquidityRebalanced: transaction.liquidityRebalanced
        }
    }));

    // keep only the transactions that were made
    const instadappRebalanceTransactions = transactionData.filter(transaction => dsaAccounts.includes(transaction.dsaAddr.toLowerCase()));

    // create Sets to store unique users and tokenIds
    const tokenPools = new Set();

    const transactions = await convertLiquidityToTokens(instadappRebalanceTransactions);

    transactions.forEach(transaction => {
        // add tokenIds and users of each transaction into respective sets
        tokenPools.add(transaction.oldTokenId);
        tokenPools.add(transaction.newTokenId);
        totalLiquidityRebalancedInUsd += Number(transaction.token0Usd);
        totalLiquidityRebalancedInUsd += Number(transaction.token1Usd);
    });
    // console.log(convertLiquidityToTokens);

    // console.log("List of all Rebalance Transactions on Instadapp: ", instadappRebalanceTransactions);
    console.log("List of all Rebalance Transactions with Token info: ", transactions);
    console.log("Total no. of times the strategy got used: ", transactions.length);
    console.log("Token Pools: ", tokenPools);
    console.log("Total Liquidity rebalanced in USD: ", totalLiquidityRebalancedInUsd);
}

const main = async () => {
    // get list of all dsaAccounts in the protocol
    const dsaAccounts = await getDsaAccounts();
    // const { dsaAccounts } = require("./dsaAccounts");
    // get data by tracking IncreaseLiquidity and DecreaseLiquidity transactions
    getEvents(dsaAccounts);
}

main();