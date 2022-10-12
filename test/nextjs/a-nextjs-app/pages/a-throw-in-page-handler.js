/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

// Gets called on every request.
export async function getServerSideProps () {
  return {
    props: {
      currTime: Date.now()
    }
  }
}

function AThrowInPageHandler ({ currTime }) {
  // If this is called from a browser-side click of a <Link>, e.g. as on the
  // index.js page, then this function is executed client-side. If called
  // via separately visiting http://localhost:3000/a-throw-in-page-handler
  // or via `curl -i ...`, then this is executed server-side. Only in the
  // latter case will the Node.js APM agent capture an error, of course.
  throw new Error('throw in page handler')
}

export default AThrowInPageHandler
