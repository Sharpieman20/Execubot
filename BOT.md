
How to run twap bot:

Run "ts-node src/typescript/bot.ts"

By default it runs in "demo mode", where the orders that would be placed are simply logged to console.
In demo mode, you'll notice the size increases over time - this is the bot reacting to the not actually placed orders not being filled and re-distributing that size to other orders.

To run in production, I'd recommend contacting me directly, but can comment out the code in "safePlaceOrder", and change the relevant addresses and it should work.
