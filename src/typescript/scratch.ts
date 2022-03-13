import * as os from 'os'
import * as fs from 'fs'
import { Account, Connection, PublicKey } from '@solana/web3.js';
import { Market } from '@project-serum/serum';

function sleep(ms: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

class TwapOrder {
    sizeToGet: number;
    stepSizeToGet: number;
    sizeFilled: number;
    numOrdersToPlace: number;
    numOrdersPlaced: number;
    startTime: Date;
    endTime: Date;
    endSleepTime: Date;

    constructor(size: number, numOrdersToPlace: number, startTime: Date, endTime: Date) {
        this.sizeToGet = size;
        this.stepSizeToGet = 0;
        this.sizeFilled = 0;
        this.numOrdersPlaced = 0;
        this.startTime = startTime;
        this.numOrdersToPlace = numOrdersToPlace;
        this.endTime = endTime;
        this.endSleepTime = startTime;
    }

    startStep() {

        let numOrdersLeft = this.numOrdersToPlace - this.numOrdersPlaced;
        let sizeLeft = this.sizeToGet - this.sizeFilled;

        this.stepSizeToGet = sizeLeft / numOrdersLeft;
    }

    endStep() {

        this.numOrdersPlaced++;
    }

    initSleepStep() {

        let baseSleepDuration = (this.endTime.valueOf() - this.startTime.valueOf()) / (this.numOrdersToPlace - 1);

        this.endSleepTime = new Date(this.startTime.valueOf() + (baseSleepDuration * (this.numOrdersPlaced+1)));
    }

    checkAwake() {

        let currentTime = new Date();

        if (currentTime.valueOf() > this.endSleepTime.valueOf()) {

            return true;
        }
        return false;
    }
}

class TwapSession {
    connection: Connection;
    market: Market;
    owner: Account;
    order: TwapOrder;
    payer: PublicKey;

    constructor(connection: Connection, market: Market, owner: Account, order: TwapOrder, payer: PublicKey) {

        this.connection = connection;
        this.market = market;
        this.owner = owner;
        this.order = order;
        this.payer = payer;
    }
}




async function safePlaceOrder(twapSession: TwapSession, priceToPlace: number, sizeToPlace: number, sideToPlace: string) {

    // temporarily commented out for testing

    /* 
    await twapSession.market.placeOrder(twapSession.connection, {
        twapSession.owner,
        twapSession.payer,
        side: sideToPlace,
        price: priceToPlace,
        size: sizeToPlace,
        orderType: 'limit',
    });
    */
    let curTime = new Date();
    console.log(curTime.toLocaleString() + ' placed order with price ' + priceToPlace + ' size ' + sizeToPlace + ' sideToPlace ' + sideToPlace);
}

async function safeCancelAllOpenOrders(twapSession: TwapSession) {
    let myOrders = await twapSession.market.loadOrdersForOwner(twapSession.connection, twapSession.owner.publicKey);

    // Cancelling orders
    for (let order of myOrders) {
        console.log("Cancel my order " + order.size);
        let didCancelSuccessfully = false;

        while (!didCancelSuccessfully) {

            try {
                await twapSession.market.cancelOrder(twapSession.connection, twapSession.owner, order);
                didCancelSuccessfully = true;
            } catch (error) {
                
            }
            await sleep(1000);
        }
    }
}

async function getPriceToPlaceAt(twapSession: TwapSession, orderSide: string): Promise<number> {
    
    let cumulativeSize = 0;

    if (orderSide == 'buy') {
        let bids = await twapSession.market.loadBids(twapSession.connection);

        for (let [price, size] of bids.getL2(10)) {

            cumulativeSize += size;

            if (cumulativeSize >= twapSession.order.stepSizeToGet) {

                return price;
            }
        }
        return 0.0;
    } else {
        let asks = await twapSession.market.loadAsks(twapSession.connection);

        for (let [price, size] of asks.getL2(10)) {

            cumulativeSize += -1*size;

            if (cumulativeSize <= twapSession.order.stepSizeToGet) {

                return price;
            }
        }
        return 999999999999999.0;
    }
}

async function twapStep(twapSession: TwapSession) {

    // cancel orders from previous steps
    await safeCancelAllOpenOrders(twapSession);

    // fetch current market price
    let orderSide = twapSession.order.sizeToGet > 0 ? 'buy' : 'sell';
    let price = await getPriceToPlaceAt(twapSession, orderSide);

    // place order for this step
    await safePlaceOrder(twapSession, price, twapSession.order.stepSizeToGet, orderSide);

    await twapWait(twapSession);
}

async function checkForFills(twapSession: TwapSession) {

    for (let openOrders of await twapSession.market.findOpenOrdersAccountsForOwner(
        twapSession.connection,
        twapSession.owner.publicKey,
        )) {
            // don't understand why this is needed but it fails if we try and settleFunds with this address
            if (openOrders.address.toString() == 'DMGeWcS6Tqf7fpKubf2UBzX9KeWCUAFRP3p8d8kYVuXz') {
                continue;
            }
            if (openOrders.baseTokenFree.toNumber() > 0 || openOrders.quoteTokenFree.toNumber() > 0) {
                // spl-token accounts to which to send the proceeds from trades
                // Enter your specific ones here
                let baseTokenAccount = new PublicKey('BjrbDMk7VRXWy4bvdyWcKiSpMVA3LqPurD9dNnmpe2kr');
                let quoteTokenAccount = new PublicKey('Ba35MfWRzcyotH29qqtGNdqJNkok75iyHqWm1ZCNkeHe');

                console.log('settle for address ' + openOrders.address + ' owner ' + openOrders.owner + ' publicKey ' + openOrders.publicKey);
    
                await twapSession.market.settleFunds(
                    twapSession.connection,
                    twapSession.owner,
                    openOrders,
                    baseTokenAccount,
                    quoteTokenAccount,
                );

                twapSession.order.sizeFilled += openOrders.baseTokenFree.toNumber();
            }
        }
}

async function twapWait(twapSession: TwapSession) {

    twapSession.order.initSleepStep();

    while (!twapSession.order.checkAwake()) {

        await checkForFills(twapSession);
        await sleep(1000);
    }
}

async function createTwapSession(twapOrder: TwapOrder): Promise<TwapSession> {

    let connection = new Connection('https://friktion.genesysgo.net');
    let marketAddress = new PublicKey('9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT');
    let programAddress = new PublicKey('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin');

    const owner = new Account(
        JSON.parse(
            fs.readFileSync(
              os.homedir() + '/.config/solana/keys/test_twap_account.json',
              'utf-8',
            ),
        ),
    );

    let market = await Market.load(connection, marketAddress, {}, programAddress);

    let payer = new PublicKey('DdJY8mvrYtjzScQFYEwEW2LLvQEygtZXNAebkncLnDqX'); 

    return new TwapSession(connection, market, owner, twapOrder, payer);
}

async function doTwap(twapOrder: TwapOrder) {

    let twapSession = await createTwapSession(twapOrder);

    for (let i = 0; i < twapSession.order.numOrdersToPlace; i++) {

        twapSession.order.startStep();

        await twapStep(twapSession);

        twapSession.order.endStep();
    }
}

async function main() {

    let minutesToTwap = 1.5;
    let ordersToPlace = 3;
    let sizeToPlace = 0.01;

    let startDate = new Date();
    let endDate = new Date(startDate.getTime() + minutesToTwap*60000);
    
    let myOrder = new TwapOrder(sizeToPlace, ordersToPlace, startDate, endDate);

    await doTwap(myOrder);
}

// console.log(process.argv);

main();
