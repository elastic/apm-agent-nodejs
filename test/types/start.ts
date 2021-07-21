import agent from '../../start'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'

const req = new IncomingMessage(new Socket())
const res = new ServerResponse(req)
agent.middleware.connect()(new Error(), req, res, () => {})
