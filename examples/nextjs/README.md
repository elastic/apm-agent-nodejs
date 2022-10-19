This is a [Next.js](https://nextjs.org/) application
1. bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app), and then
2. modified to use the Elastic APM Node.js agent to monitor the Next server.

## Getting Started

1. `npm install`

2. Configure an APM server URL and token for the APM agent. See the [APM Quick start](https://www.elastic.co/guide/en/apm/guide/current/apm-quick-start.html) for setting up an Elastic Stack.

    ```bash
    cp elastic-apm-node.js.template elastic-apm-node.js
    vi elastic-apm-node.js
    ```

3. Run the Next.js server:

    ```bash
    npm run dev  # the development server
    npm run build && npm start  # or the production server
    ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
An [API route](https://nextjs.org/docs/api-routes/introduction) can be accessed at <http://localhost:3000/api/hello>.

## Learn More

- [Get started with Next.js and Elastic APM](https://www.elastic.co/guide/en/apm/agent/nodejs/master/nextjs.html)
- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
