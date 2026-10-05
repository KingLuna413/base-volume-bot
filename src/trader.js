'use strict';

const { ethers } = require('ethers');
const { SWAP_ROUTER, WETH, POOL_FEE, ROUTER_ABI, ERC20_ABI } = require('./constants');

class Trader {
  constructor({ rpcUrl, privateKey, slippageBps, delayMs, gasLimit }) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    const pk = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
    this.wallet = new ethers.Wallet(pk, this.provider);
    this.router = new ethers.Contract(SWAP_ROUTER, ROUTER_ABI, this.wallet);
    this.slippageBps = BigInt(slippageBps);
    this.delayMs = delayMs;
    this.gasLimit = BigInt(gasLimit);
  }

  get address() {
    return this.wallet.address;
  }

  token(address) {
    return new ethers.Contract(address, ERC20_ABI, this.wallet);
  }

  async ethBalance() {
    return this.provider.getBalance(this.wallet.address);
  }

  async tokenBalance(address) {
    return this.token(address).balanceOf(this.wallet.address);
  }

  async tokenDecimals(address) {
    return Number(await this.token(address).decimals());
  }

  _minOut(expected) {
    return (expected * (10000n - this.slippageBps)) / 10000n;
  }

  // Buy token with ETH. Returns the transaction receipt.
  async buy(tokenAddress, amountEth) {
    const value = ethers.parseEther(String(amountEth));
    const base = {
      tokenIn: WETH,
      tokenOut: tokenAddress,
      fee: POOL_FEE,
      recipient: this.wallet.address,
      amountIn: value,
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n,
    };

    let minOut = 0n;
    try {
      const expected = await this.router.exactInputSingle.staticCall(base, { value });
      minOut = this._minOut(expected);
    } catch (err) {
      // quote failed; fall back to no minimum
    }

    const tx = await this.router.exactInputSingle(
      { ...base, amountOutMinimum: minOut },
      { value, gasLimit: this.gasLimit }
    );
    return tx.wait();
  }

  // Sell tokens back to ETH. Returns the transaction receipt.
  async sell(tokenAddress, amountTokens) {
    const erc20 = this.token(tokenAddress);
    const allowance = await erc20.allowance(this.wallet.address, SWAP_ROUTER);
    if (allowance < amountTokens) {
      const approveTx = await erc20.approve(SWAP_ROUTER, ethers.MaxUint256);
      await approveTx.wait();
    }

    const swapParams = {
      tokenIn: tokenAddress,
      tokenOut: WETH,
      fee: POOL_FEE,
      recipient: SWAP_ROUTER, // router holds WETH so it can unwrap
      amountIn: amountTokens,
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n,
    };

    let minOut = 0n;
    try {
      const expected = await this.router.exactInputSingle.staticCall(swapParams);
      minOut = this._minOut(expected);
    } catch (err) {
      // quote failed; fall back to no minimum
    }

    const swapData = this.router.interface.encodeFunctionData('exactInputSingle', [
      { ...swapParams, amountOutMinimum: minOut },
    ]);
    const unwrapData = this.router.interface.encodeFunctionData('unwrapWETH9', [
      minOut,
      this.wallet.address,
    ]);

    const tx = await this.router.multicall([swapData, unwrapData], {
      gasLimit: this.gasLimit,
    });
    return tx.wait();
  }
}

module.exports = Trader;
