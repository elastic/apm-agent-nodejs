import Head from "next/head"
import Link from "next/link"

// XXX v demo app inits @elastic/apm-rum here

function Header() {
  return (
    <>
      <Head>
        <title>A Next.js App</title>
      </Head>
      <header>
        {/* <div style={{ margin-bottom: '10px' }}> */}
        <div style={{ marginBottom: '20px' }}>
          <Link href="/"><a>Home</a></Link>
          &nbsp;|&nbsp;
          <Link href="/a-page"><a>APage</a></Link>
          &nbsp;|&nbsp;
          <Link href="/a-page-redirect"><a>redirect-to-APage</a></Link>
          &nbsp;|&nbsp;
          <Link href="/a-page-rewrite"><a>rewrite-to-APage</a></Link>
          &nbsp;|&nbsp;
          <Link href="/an-ssr-page"><a>AnSSRPage</a></Link>
          &nbsp;|&nbsp;
          <Link href="/an-ssr-error-page"><a>AnSSRErrorPage</a></Link>
          &nbsp;|&nbsp;
          <Link href="/a-dynamic-page/42"><a>ADynamicPage/42</a></Link>
          &nbsp;|&nbsp;
          <Link href="/api/an-api-endpoint"><a>AnAPIEndpoint</a></Link>
        </div>
      </header>
    </>
  )
}

export default Header
