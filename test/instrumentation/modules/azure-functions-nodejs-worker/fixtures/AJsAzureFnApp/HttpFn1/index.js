/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

module.exports = async function (context, _req) {
  // Only used if none of the following are used.
  context.res = {
    status: 200,
    headers: {
      MyFnName: 'HttpFn1'
    },
    body: 'this is HttpFn1'
  }

  // XXX make tests for all of these

  // // This wins over `context.res`.
  // context.bindings.res = {
  //   status: 201,
  //   headers: {
  //     Spam: 'Eggs'
  //   },
  //   body: 'this is from context.bindings.res'
  // }

  // context.bindings.res = 'context.bindings.res is a string'
  // context.bindings.res = 42

  // If '$return', then: status=203. This wins over `return { status: 202, ...}`.
  //    That value *is* in hookCtx.result.
  // Otherwise, this ends up in hookCtx.result (eliminating the return value),
  //    but isn't used because field names don't match 'res' out binding.
  // context.done(
  //   null, { status: 203, body: 'this is from context.done() call' }
  // )

  // context.done(
  //   null, { res: { status: 203, body: 'this is from context.done() call' } }
  // )

  // If '$return', then: status=200, no body
  // Otherwise, ignored.
  // return { foo: 'bar' }

  // If '$return', then: status=500 with logged error (not captured)
  //   Stack: Error: The HTTP response must be an 'object' type that can include properties such as 'body', 'status', and 'headers'. Learn more: https://go.microsoft.com/fwlink/?linkid=2112563
  // Otherwise, ignored.
  // return 'this is return value string'

  // If '$return', then: this wins and works as expected.
  // Otherwise: ignored.
  // return {
  //   status: 202,
  //   headers: {
  //     Foo: 'bar'
  //   },
  //   body: 'this is from return value direct object'
  // }

  // If '$return', then: status=200 default, all fields in object ignored.
  // Otherwise: this wins over `context.*` usage because the "res" field matches "out" binding.
  // return {
  //   res: {
  //     status: 202,
  //     headers: {
  //       Foo: 'bar'
  //     },
  //     body: 'this is from return value with "res" field'
  //   }
  // }

  // Rules:
  // - if `$return` out binding, then `httpRes = hookCtx.result`.
  // - else: `httpRes = hookCtx.result[httpOutputName] || context.binding[httpOutputName] || context.res`
  // - if `httpRes` isn't an object (e.g. is a string), then status=500 and *consider*
  //   capturing a manufactured error? Just comment on it for now?
}
