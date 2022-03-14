const Web3 = require("web3");
require("dotenv").config();
const axios = require("axios");

const alchemyPolygonLink = `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`;
var web3 = new Web3(new Web3.providers.HttpProvider(alchemyPolygonLink));

const { uniswapPositionsNFTabi } = require("./ABIs/uniswapPositionsNFTabi");
const { uniswapV3FactoryAbi } = require("./ABIs/uniswapV3FactoryAbi");
const { uniswapV3PoolAbi } = require("./ABIs/uniswapV3PoolAbi");
const { liquidityAmountsAbi } = require("./ABIs/liquidityAmountsAbi");
const { erc20TokenAbi } = require("./ABIs/erc20TokenAbi");

const uniswapPositionsNFTAddress = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const uniswapV3FactoryAddress = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const liquidityAmountsAddress = '0x878C410028E3830f1Fe03C428FF95012111Ae1f1';

const uniswapPositionsNFTContract = new web3.eth.Contract(uniswapPositionsNFTabi, uniswapPositionsNFTAddress);
const uniswapV3FactoryContract = new web3.eth.Contract(uniswapV3FactoryAbi, uniswapV3FactoryAddress);
const liquidityAmountsContract = new web3.eth.Contract(liquidityAmountsAbi, liquidityAmountsAddress);

const x60 = web3.utils.toBN("2").pow(web3.utils.toBN("60"));

const calculateSqrtPriceX96 = (lowerTick, upperTick) => {
    if (!lowerTick || lowerTick == 0) throw new Error("lowerTick not defined");
    if (!upperTick || upperTick == 0) throw new Error("upperTick not defined");

    const lowerPrice = 1.0001 ** Number(lowerTick);
    const upperPrice = 1.0001 ** Number(upperTick);

    const lowerSqrtPriceX36 = Math.round(Math.sqrt(lowerPrice) * 2 ** 36);
    const upperSqrtPriceX36 = Math.round(Math.sqrt(upperPrice) * 2 ** 36);
    const lowerSqrtPriceX96 = web3.utils.toBN(lowerSqrtPriceX36.toString()).mul(x60);
    const upperSqrtPriceX96 = web3.utils.toBN(upperSqrtPriceX36.toString()).mul(x60);
    return [lowerSqrtPriceX96, upperSqrtPriceX96];
}


async function convertLiquidityToTokens(transactions) {
    return await Promise.all(transactions.map(async (transaction) => {
        // use "https://polygonscan.com/address/0xC36442b4a4522E871399CD717aBDD847Ab11FE88#readContract" to get - 
        // token0 address
        // token1 address
        // fee
        // tickUpper
        // tickLower
        const positions = await uniswapPositionsNFTContract.methods.positions(transaction.newTokenId).call();
        // console.log(positions);
        const { token0, token1, fee, tickLower, tickUpper, liquidity } = positions;

        // use above obtained values in the getPool function here - "https://polygonscan.com/address/0x1F98431c8aD98523631AE4a59f267346ea31F984#readContract" to get -
        // pool address
        const poolAddress = await uniswapV3FactoryContract.methods.getPool(token0, token1, fee).call();
        // console.log(poolAddress);

        // get slot0 value of that pool address to get current-tick sqrtX value for that pool
        const uniswapV3PoolContract = new web3.eth.Contract(uniswapV3PoolAbi, poolAddress);
        const slot0 = await uniswapV3PoolContract.methods.slot0().call();
        const currentSqrtPriceX96 = slot0.sqrtPriceX96;
        // console.log("currentSqrtPriceX96 :", currentSqrtPriceX96);

        // use the calculateSqrtPriceX96 function from Slack to get upper-tick and lower-tick sqrtRatios
        // requires upper-tick and lower-tick values as params
        const [lowerSqrtPriceX96, upperSqrtPriceX96] = calculateSqrtPriceX96(tickLower, tickUpper);
        // console.log("lowerSqrtPriceX96 :", lowerSqrtPriceX96.toString());
        // console.log("upperSqrtPriceX96 :", upperSqrtPriceX96.toString());
        // console.log("liquidity: ", liquidity);

        // use uniswap nft manager to convert liquidity to amount0 and amount1
        // requires current-tick, upper-tick and lower-tick sqrtRatios as params along with liquidity
        let { amount0, amount1 } = await liquidityAmountsContract.methods.getAmountsForLiquidity(currentSqrtPriceX96, lowerSqrtPriceX96, upperSqrtPriceX96, liquidity).call();
        // console.log("amount0: ", amount0);
        // console.log("amount1: ", amount1);

        const tokenPrices = (await axios.get("https://api.instadapp.io/defi/polygon/prices")).data;

        const token0Contract = new web3.eth.Contract(erc20TokenAbi, token0);
        const token1Contract = new web3.eth.Contract(erc20TokenAbi, token1);

        const decimals0 = await token0Contract.methods.decimals().call();
        const decimals1 = await token1Contract.methods.decimals().call();

        const token0USD = (amount0 * (tokenPrices[token0]) / (10 ** decimals0)).toString();
        const token1USD = (amount1 * (tokenPrices[token1]) / (10 ** decimals1)).toString();

        // console.log("token0 usd: ", token0USD);
        // console.log("token1 usd: ", token1USD);

        const transactionWithTokenInfo = transaction;
        delete transactionWithTokenInfo.liquidityRebalanced;
        transactionWithTokenInfo.token0Usd = token0USD;
        transactionWithTokenInfo.token1Usd = token1USD;

        return transactionWithTokenInfo;
    }))
}

module.exports = convertLiquidityToTokens;