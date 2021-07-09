import apm from '../../start'
import { IncomingMessage, ServerResponse } from 'http'
import { Socket } from 'net'

const req = new IncomingMessage(new Socket())
const res = new ServerResponse(req)
apm.middleware.connect()(new Error(), req, res, () => {})
