const axios = require('axios');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const {readFileSync} = require('fs');

let ASSET_PLATFORM = process.argv[2];
if (!ASSET_PLATFORM) {
	console.log('no asset platform specified hence using the default one i.e. "arbitrum-one"');
	ASSET_PLATFORM = 'arbitrum-one';
} else {
	console.log(`using "${ASSET_PLATFORM}" as the asset platform`);
}

const readInput = path => {
	const data = readFileSync(path, 'utf8').split('\n').filter(Boolean);
	const headers = data.shift().trim().split(',');
	return [...new Set(data)].map(v => {
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const formatDate = ts => {
	const _ = val => val.toString().padStart(2, '0')
	const date = new Date(ts);
	return `${_(date.getDate())}-${_(date.getMonth() + 1)}-${date.getFullYear()}`;
};

const getCoinId = async (contractAddress, attempt = 0) => {
	try {
		const {data: {id}} = await axios.get(`https://api.coingecko.com/api/v3/coins/${ASSET_PLATFORM}/contract/${contractAddress}`);
		return id;
	} catch (err) {
		const error = err?.response?.data?.error;
		if (error === 'Could not find coin with the given id') {
			console.error(error, contractAddress);
		} else if (attempt < 5) {
			await sleep(1000 * ++attempt);
			return await getCoinId(contractAddress, attempt);
		}
	}
}

const sendGetRequest = async (coinId, from, to, attempt = 0) => {
	try {
		const {data} = await axios.get(`https://api.coingecko.com/api/v3/coins/${coinId}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`);
		return data;
	} catch (err) {
		if (attempt < 5) {
			await sleep(2000 * ++attempt);
			return await sendGetRequest(coinId, from, to, attempt);
		}
	}
};

const getPrices = async () => {
	console.time('it took');
	const inputs = readInput('prices_input.csv');
	const contractAddresses = [...new Set(inputs.map(v => v.contract_address))];
	const coinMap = {};
	for (const contractAddress of contractAddresses) {
		const coinId = await getCoinId(contractAddress);
		if (coinId) coinMap[contractAddress] = coinId;
	}
	const data = [];
	for (const input of inputs) {
		const coinId = coinMap[input.contract_address];
		const results = coinId ? await sendGetRequest(coinId, input.from, input.to): {};
		if (results?.prices) {
			data.push(...results.prices.map(v => ({
				contract_address: input.contract_address,
				coinId,
				date: formatDate(v[0]),
				price: v[1]
			})));
		} else if (coinId) {
			console.log(coinId, results);
			console.error('Could not find price with the given id', coinId, 'for the range b/w', input.from, 'and', input.to);
		}
	}
	getCSVWriter(['contract_address', 'coinId', 'date', 'price'], 'prices_output.csv')
		.writeRecords(data)
		.then(()=> console.log('The CSV file prices_output.csv was written successfully'));
	console.timeEnd('it took');
}

getPrices();
