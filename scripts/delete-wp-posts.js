'use strict';

require('dotenv').config();

const axios = require('axios');

const WP_API = process.env.WORDPRESS_API_URL;
const WP_AUTH = 'Basic ' + Buffer.from(
  `${process.env.WORDPRESS_USERNAME}:${process.env.WORDPRESS_APP_PASSWORD}`
).toString('base64');

const TITLES_TO_DELETE = [
  'Athletic Wear Care: Keep Your Fitness Clothes Fresh',
  'Sustainable Laundry Practices: Eco-Friendly Dry Cleaning',
  'Wedding Dress Preservation: Professional Cleaning & Storage',
  'How to Remove Odors from Clothes: Tips & Professional Solutions',
  'Professional Laundry Services for Busy Professionals',
  'Why Your Clothes Shrink in the Wash: Prevention Tips',
  'Delicate Fabric Care: Hand Washing vs. Professional Dry Cleaning',
  'Best Laundry Services Near Me: What to Look For',
  'Dry Cleaning vs. Home Washing: Fabric Care Guide',
];

async function main() {
  const headers = { Authorization: WP_AUTH };

  console.log('Fetching posts from WordPress...');
  const res = await axios.get(`${WP_API}/posts`, {
    params: { status: 'publish', per_page: 100, _fields: 'id,title,slug' },
    headers,
    timeout: 15000,
  });

  const posts = res.data || [];
  console.log(`Found ${posts.length} published posts.\n`);

  for (const title of TITLES_TO_DELETE) {
    const match = posts.find(p =>
      (p.title?.rendered || '').trim().toLowerCase() === title.trim().toLowerCase()
    );

    if (!match) {
      console.log(`NOT FOUND: "${title}"`);
      continue;
    }

    try {
      await axios.delete(`${WP_API}/posts/${match.id}`, {
        params: { force: true },
        headers,
        timeout: 15000,
      });
      console.log(`DELETED [${match.id}]: "${title}"`);
    } catch (err) {
      console.error(`FAILED  [${match.id}]: "${title}" — ${err.response?.data?.message || err.message}`);
    }
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Script failed:', err.message);
  process.exit(1);
});
