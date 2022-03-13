# TradingStrats
Repo for Friktion's on-chain trading strategies

# Setup

```
yarn install
```

## Generating Local Keypair
Phantom -> Export Private Key
```
python3
import base58
bytes_array = base58.b58decode("ENTER PRIVATE KEY HERE")
json_string = "[" + ",".join(map(lambda b: str(b), byte_array)) + "]"
print(json_string)
```
Paste output into 
```
~/.config/solana/twap_authority.json
```

# Example

```
ts-node src/scratch.ts
```
