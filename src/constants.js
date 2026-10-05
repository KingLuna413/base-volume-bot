'use strict';

// Base mainnet addresses
const SWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481'; // Uniswap V3 SwapRouter02
const WETH = '0x4200000000000000000000000000000000000006';
const POOL_FEE = 10000; // ape.store pools use the 1% fee tier
const TICK_SPACING = 200;

const ROUTER_ABI = [
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)',
  'function unwrapWETH9(uint256 amountMinimum,address recipient) payable',
  'function multicall(bytes[] data) payable returns (bytes[] results)',
];

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)',
];

module.exports = { SWAP_ROUTER, WETH, POOL_FEE, TICK_SPACING, ROUTER_ABI, ERC20_ABI };
