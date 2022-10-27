/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

import Head from 'next/head'
import Link from 'next/link'

function Header () {
  return (
    <>
      <Head>
        <title>A Next.js App</title>
      </Head>
      <header>
        <div style={{ marginBottom: '20px' }}>
          <Link href="/">Home</Link>
          &nbsp;|&nbsp;
          <Link href="/a-page">APage</Link>
          &nbsp;|&nbsp;
          <Link href="/an-ssr-page">AnSSRPage</Link>
          &nbsp;|&nbsp;
          <Link href="/a-dynamic-page/42">ADynamicPage/42</Link>
        </div>
      </header>
    </>
  )
}

export default Header
