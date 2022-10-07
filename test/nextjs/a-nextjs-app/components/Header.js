/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

import Head from 'next/head'
import Link from 'next/link'

// XXX v demo app inits @elastic/apm-rum here

function Header () {
  return (
    <>
      <Head>
        <title>A Next.js App</title>
      </Head>
      <header>
        <div style={{ marginBottom: '20px' }}>
          <Link href="/"><a>Home</a></Link>
          &nbsp;|&nbsp;
          <Link href="/a-page"><a>APage</a></Link>
          &nbsp;|&nbsp;
          <Link href="/an-ssr-page"><a>AnSSRPage</a></Link>
          &nbsp;|&nbsp;
          <Link href="/an-ssr-error-page"><a>AnSSRErrorPage</a></Link>
          &nbsp;|&nbsp;
          <Link href="/a-dynamic-page/42"><a>ADynamicPage/42</a></Link>
        </div>
      </header>
    </>
  )
}

export default Header
