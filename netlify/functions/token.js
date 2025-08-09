import Ably from 'ably/promises';

export async function handler() {
  try {
    const apiKey = process.env.ABLY_API_KEY;
    const client = new Ably.Rest(apiKey);
    const tokenRequest = await client.auth.createTokenRequest({ clientId: 'netlify-client' });
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(tokenRequest)
    };
  } catch (err) {
    return { statusCode: 500, body: 'Token error: ' + err.message };
  }
}
