import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";
import axiosRateLimit from "axios-rate-limit";

const transposeClient: AxiosInstance = axiosRateLimit(
  axios.create({
    baseURL: "https://api.transpose.io/sql",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": "IAfFLxVdbTUhUYLpzPeM5tjxTwXu6j25",
    },
  }),
  {
    maxRequests: 1, // Maximum requests per second (alternative to perMilliseconds)
    perMilliseconds: 3000,
  }
);

export { transposeClient };
