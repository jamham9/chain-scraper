const axios = require('axios');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const {readFileSync} = require('fs');
require('dotenv').config();
console.log(process.env);

var etherscan_api_key = process.env.etherscan_api_key // Replace with Etherscan API key

function readInput(path) {
    const data = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    const headers = data.shift().trim().split(',');
    return data.map(v => {
        return v.split(',').reduce((acc, curr, index) => {
            acc[headers[index]] = curr.trim().toLowerCase();
            return acc;
        }, {})
    });
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getCSVWriter(headers, path = 'out.csv') {
    return createCsvWriter({
        path,
        header: headers.map(v => ({id: v, title: v}))
      });
}

async function get_contract_transactions(address, attempt = 0) {
    try {
        var api_url = `https://api.snowtrace.io/api?module=account&action=tokentx&address=${address}&startblock=0&endblock=999999999&sort=asc&apikey=${etherscan_api_key}`
        var addresses = await axios.get(api_url)
        const result = addresses.data.result;
        if (typeof result !== 'object') throw Error('limit exceed');
        return result;
    } catch (err) {
        if (attempt < 5) {
            console.log('call failed, retrying attempt:', ++attempt);
            await sleep(1000 * attempt);
            return await get_contract_transactions(address, attempt);
        } else {
            return [];
        }
    }
}

async function scrapWallets() {
    const inputs = readInput('wallet_token_tx_input.csv');
    const headers = ['signal', 'tx_hash', 'timestamp', 'date', 'time', 'from', 'to', 'tokenAddress', 'tokenSymbol', 'tokenName', 'value'];
    const data = [];
    for (const input of inputs) {
        const {wallet_address} = input;
        console.log('fetching data for wallet', wallet_address);
        const transactions = await get_contract_transactions(wallet_address);
        transactions.forEach(transfer => {
            const datetime = new Date(transfer["timeStamp"] * 1000).toISOString();
            const date = datetime.substring(0, 10);
            const time = datetime.substring(11, 19);
    
            let buy_or_sell;
    
            if (transfer["to"].toLowerCase() == wallet_address.toLowerCase()) {
                buy_or_sell = "BUY"
            } else {
                buy_or_sell = "SELL"
            }
    
            data.push({
                signal: buy_or_sell,
                tx_hash: transfer["hash"],
                timestamp: transfer["timeStamp"],
                date: date,
                time: time,
                from: transfer["from"],
                to: transfer["to"],
                tokenAddress: transfer["contractAddress"],
                tokenSymbol: transfer["tokenSymbol"],
                tokenName: transfer["tokenName"],
                value: transfer["value"] / 1000000000000000000,
            });
        });
        await sleep(5000);
    }
    getCSVWriter(headers, 'wallet_token_tx_output.csv')
        .writeRecords(data)
        .then(()=> console.log('The CSV file wallet_token_tx_output.csv was written successfully'));
}

scrapWallets();