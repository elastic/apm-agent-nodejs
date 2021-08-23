// Test the start.d.ts type file by exercising the API in TypeScript.
// `tsc` will error out of there is a type conflict.

import agent from '../../start'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'

const req = new IncomingMessage(new Socket())
const res = new ServerResponse(req)
agent.middleware.connect()(new Error(), req, res, () => {})
