import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import axios from 'axios';

const typeDefs = `#graphql
  type StockPrice {
    symbol: String
    price: Float
    currency: String
  }

  type StockTicker {
    isin : String,
    ticker : String
  }

  input Stock {
    ticker : String,
    country : String
  }

  type Query {
    getStock(ticker: String!, market: String!): StockPrice
    getTicker(isin: String!): StockTicker
    ping: String
    getStocks(stocks: [Stock]!): [StockPrice]
    getTickers(isinList: [String]!): [StockTicker]
  }
`;

const resolvers = {
  Query: {
    ping: () => "pong",
    getTicker: async (_, { isin }) => {
      try {
        const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=1&newsCount=0`;
        const response = await axios.get(url);
        const quotes = response.data?.quotes;

        if(!quotes || quotes.length === 0){
          console.warn(`[Warning] No ticker found for ISIN: ${isin}`);
          return null;
        }

        const ticker = response.data.quotes[0].symbol;

        return {
          isin : isin,
          ticker : ticker
        };
      } catch (error) {
        console.error("API 호출 에러:", error);
        return null;
      }
    },
    getStock: async (_, { ticker, market }) => {
      try {
        const marketUlr = market === "US" ? "" : ".KS";

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}${marketUlr}?interval=1d&range=1d`;
        const response = await axios.get(url);
        const result = response.data.chart?.result;

        return {
          symbol: ticker,
          price: result[0].meta.regularMarketPrice,
          currency: result[0].meta.currency,
        };
      } catch (error) {
        
        if(error.response && error.response.status === 404){
          console.warn(`[404] 존재하지 않는 종목입니다: ${ticker}`);
          return null;
        }

        console.error("API 호출 에러:", error);
        return null;
      }
    },
    getStocks: async (_, { stocks }) => {
      const promies = [];
      stocks.forEach(async ({ticker, country}) => {
        if(!ticker) return;
        const promise = new Promise(async (resolve, reject)=>{
          try {
            const marketUlr = country === "US" ? "" : ".KS";

            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}${marketUlr}?interval=1d&range=1d`;
            resolve({
              ticker : ticker,
              res : await axios.get(url)
            });
          }
          catch (error) {
            if(error.response && error.response.status === 404){
              console.warn(`[404] 존재하지 않는 종목입니다: ${ticker}`);
              resolve({
                ticker : ticker,
                res : null
              });
              return;
            }

            console.error("API 호출 에러:", error);
            reject(error);
          }
        })

        promies.push(promise);
      });

      const responses = await Promise.all(promies);

      const result = responses.map(({res, ticker})=>{
        if(!res) return {
          symbol: ticker,
          price: 0,
          currency: null,
        };

        const result = res.data.chart?.result;

        return {
          symbol: ticker,
          price: result[0].meta.regularMarketPrice,
          currency: result[0].meta.currency,
        };
      });

      return result;
    },
    getTickers: async (_, { isinList }) => {
      const promies = isinList.map(async (isin) => {
        return new Promise(async (resolve, reject)=>{
          try {
            const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${isin}&quotesCount=1&newsCount=0`;
            resolve({
              res : await axios.get(url),
              isin,
            });
          }
          catch (error) {
            console.error("API 호출 에러:", error);
            reject(error);
          }
        })
      });

      const responses = await Promise.all(promies);

      const result = responses.map(({res, isin})=>{
        const quotes = res.data.quotes;

        if(!quotes || quotes.length === 0){
          console.warn(`[Warning] No ticker found for ISIN: ${isin}`);
          return null;
        }

        return {
          isin,
          ticker : quotes[0].symbol
        };
      });

      return result;
    },
  },
};

const server = new ApolloServer({ typeDefs, resolvers });
const { url } = await startStandaloneServer(server, { listen: { port: 4000 } });
console.log(`🚀 서버 준비 완료: ${url}`);