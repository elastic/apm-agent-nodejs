/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

/* eslint-disable no-unused-vars */
import { useRouter } from 'next/router';
import Header from '../../components/Header';

// Run at build time to determine a set of dynamic paths to prerender at build time.
// https://nextjs.org/docs/basic-features/data-fetching/get-static-paths
export async function getStaticPaths() {
  return {
    paths: [
      { params: { num: '41' } },
      { params: { num: '42' } },
      { params: { num: '43' } },
    ],
    fallback: true, // false, true, or 'blocking'
  };
}

export async function getStaticProps({ params }) {
  return {
    props: {
      doubleThat: Number(params.num) * 2,
    },
  };
}

const ADynamicPage = ({ doubleThat }) => {
  const router = useRouter();
  const { num } = router.query;

  return (
    <>
      <Header />
      <main>
        <div>
          This is ADynamicPage {num} - doubleThat is {doubleThat}
        </div>
      </main>
    </>
  );
};

export default ADynamicPage;
