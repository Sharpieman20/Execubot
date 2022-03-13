import * as os from 'os'
import * as fs from 'fs'
import { Account, Connection, PublicKey } from '@solana/web3.js';
import { Market } from '@project-serum/serum';


async function main() {
    let connection = new Connection('https://friktion.genesysgo.net');
    // SOL/USDC market address hardcoded.
    let marketAddress = new PublicKey('9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT');
    // Serum DEX V3 hardcoded.
    let programAddress = new PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
    let market = await Market.load(connection, marketAddress, {}, programAddress);

    // Fetching orderbooks
    console.log("Fetching Bids...");
    let bids = await market.loadBids(connection);
    console.log("Fetching Asks...")
    let asks = await market.loadAsks(connection);
    // L2 orderbook data
    for (let [price, size] of bids.getL2(20)) {
    console.log("price: ", price, "size: ", size);
    }
    // Full orderbook data
    for (let order of asks) {
    console.log(
        "order id: ", order.orderId,
        "price: ", order.price,
        "size: ", order.size,
        "side: ", order.side, // 'buy' or 'sell'
    );
    }

    // Use your private keypair here. 
    const owner = new Account(
        JSON.parse(
            fs.readFileSync(
              os.homedir() + '/.config/solana/twap_authority.json',
              'utf-8',
            ),
        ),
      );    
    console.log("Sending Order...");
    // enter your USDC token account here
    let payer = new PublicKey('BjrbDMk7VRXWy4bvdyWcKiSpMVA3LqPurD9dNnmpe2kr'); 
    await market.placeOrder(connection, {
    owner,
    payer,
    side: 'buy', // 'buy' or 'sell'
    price: 1,
    size: 0.1,
    orderType: 'limit', // 'limit', 'ioc', 'postOnly'
    });
    console.log("Retrieving Open Orders");
    // Retrieving open orders by owner
    let myOrders = await market.loadOrdersForOwner(connection, owner.publicKey);

    // Cancelling orders
    for (let order of myOrders) {
        await market.cancelOrder(connection, owner, order);
    }

    // Retrieving fills
    for (let fill of await market.loadFills(connection)) {
        console.log("Retrieving Fills");
        console.log("order id: ", fill.orderId, "price: ", fill.price, "size: ", fill.size, "side: ", fill.side);
    }
    console.log("Settling Funds...");
    // Settle funds
    for (let openOrders of await market.findOpenOrdersAccountsForOwner(
    connection,
    owner.publicKey,
    )) {
        if (openOrders.baseTokenFree.toNumber() > 0 || openOrders.quoteTokenFree.toNumber() > 0) {
            // spl-token accounts to which to send the proceeds from trades
            // Enter your specific ones here
            let baseTokenAccount = new PublicKey('BjrbDMk7VRXWy4bvdyWcKiSpMVA3LqPurD9dNnmpe2kr');
            let quoteTokenAccount = new PublicKey('Ba35MfWRzcyotH29qqtGNdqJNkok75iyHqWm1ZCNkeHe');

            await market.settleFunds(
            connection,
            owner,
            openOrders,
            baseTokenAccount,
            quoteTokenAccount,
            );
        }
    }
}

main();
