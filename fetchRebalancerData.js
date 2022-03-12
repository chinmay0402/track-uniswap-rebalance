var Web3 = require("web3");
require("dotenv").config();
const { getDsaAccounts } = require("./getDsaAccounts");

const alchemyPolygonLink = `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`;

var web3 = new Web3(new Web3.providers.HttpProvider(alchemyPolygonLink));

const contractAbi = require('./UniswapNFTPositionManagerAbi.json');

const uniswapPositionManagerContractAddress = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const contract = new web3.eth.Contract(contractAbi, uniswapPositionManagerContractAddress);
let transactionData;

const getEvents = async (dsaAccounts) => {
    // store all transaction hashes obtained from IncreaseLiquidity event emits in a set for quick search later on
    const transactionHashes = new Set();

    let latestBlock = await web3.eth.getBlockNumber(); // get the latest block number
    let currentFirstBlock = 0;
    let allValidTransactionHashes = [];

    while(currentFirstBlock <= latestBlock){
        let currentToBlock = Math.min(latestBlock, currentFirstBlock + 100000);

        // get past events of type IncreaseLiquidity between currentFirstBlock and currentToBlock block numbers from Uniswap contract
        await contract.getPastEvents("IncreaseLiquidity",
            { fromBlock: currentFirstBlock, toBlock: currentToBlock },
            (err, events) => {
                // push the transaction hash of all emitted events into the set
                for (let i = 0; i < events.length; i++) {
                    transactionHashes.add(events[i].transactionHash);
                }
            });

        // get past events of type DecreaseLiquidity between currentFirstBlock and currentToBlock block numbers
        events = await contract.getPastEvents("DecreaseLiquidity",
            { fromBlock: currentFirstBlock, toBlock: currentToBlock }
        );

        // filter out transaction hashes between the current block range that emitted both IncreaseLiquidity and DecreaseLiquidity events
        const validTransactionHashesInRange = events.map(e => {
            return {
                transactionHash: e.transactionHash,
                tokenId: e.returnValues.tokenId,
                liquidity: e.returnValues.liquidity
            };
        }).filter(transaction => transactionHashes.has(transaction.transactionHash));

        // append the list for current block range into the overall list
        allValidTransactionHashes = allValidTransactionHashes.concat(validTransactionHashesInRange);

        // update currentFirstBlock for making the next set of queries
        currentFirstBlock = currentToBlock + 1;
    }

    // get transaction data of each transaction hash obtained above 
    transactionData = await Promise.all(allValidTransactionHashes.map(async (transaction) => {
        const result = await web3.eth.getTransaction(transaction.transactionHash);
        return {
            tokenId: transaction.tokenId,
            liquidity: transaction.liquidity,
            to: result.to,
            from: result.from,
            hash: result.hash
        }
    }));

    // keep only the transactions that were made
    const idappTransactions = transactionData.filter(transaction => dsaAccounts.includes(transaction.to.toLowerCase()));

    // create Sets to store unique users and tokenIds
    const users = new Set();
    const tokenPools = new Set();

    let totalLiquidityRebalanced = 0;

    idappTransactions.forEach(transaction => {
        // add tokenIds and users of each transaction into respective sets
        tokenPools.add(transaction.tokenId);
        users.add(transaction.from);
        
        // update totalRebalancedLiquidity
        totalLiquidityRebalanced += Number(transaction.liquidity);
    })

    console.log("Users: ", users);
    console.log("No. of unique users: ", users.size);
    console.log("Token Pools: ", tokenPools);
    console.log("Total Liquidity rebalanced: ", totalLiquidityRebalanced)
}

const main = async () => {
    // get list of all dsaAccounts in the protocol
    const dsaAccounts = await getDsaAccounts();

    // get data by tracking IncreaseLiquidity and DecreaseLiquidity transactions
    getEvents(dsaAccounts);
}

main();