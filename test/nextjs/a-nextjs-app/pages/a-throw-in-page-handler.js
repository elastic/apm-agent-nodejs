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
  throw new Error('throw in page handler')
}

export default AThrowInPageHandler
