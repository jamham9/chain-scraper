const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const {readFileSync} = require('fs');

const readInput = path => {
    const data = readFileSync(path, 'utf8').split('\n').filter(Boolean);
    const headers = data.shift().trim().split(',');
    return data.map(v => {
        return v.split(',').reduce((acc, curr, index) => {
            acc[headers[index]] = curr.trim().toLowerCase();
            return acc;
        }, {})
    });
};

const getCSVWriter = (headers, path = 'out.csv') => {
    return createCsvWriter({
        path,
        header: headers.map(v => ({id: v, title: v}))
      });
};

(() => {
    const inputs = readInput('wallet_token_tx_output.csv');
    const groupByContracts = {};
    inputs.forEach(v => {
        if (!(v['tokenAddress'] in groupByContracts)) groupByContracts[v['tokenAddress']] = [];
        groupByContracts[v['tokenAddress']].push(v);
    });
    const data = Object.keys(groupByContracts).map(v => {
        const ranges = groupByContracts[v].map(x => +x.timestamp).sort((a, b) => a - b);
        return {
            contract_address: v,
            from: ranges[0],
            to: ranges[ranges.length - 1]
        }
    });
    getCSVWriter(['contract_address', 'from', 'to'], 'prices_input.csv')
        .writeRecords(data)
        .then(()=> console.log('The CSV file prices_input.csv was written successfully'));
})();