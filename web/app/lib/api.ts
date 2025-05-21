// web/app/lib/api.ts
import { supabase } from './supabase'; // Assuming supabase client is configured here

interface FetchOptions extends RequestInit {
  // You can add custom options here if needed
}

/**
 * A wrapper around the native fetch function that automatically adds
 * the Supabase JWT to the Authorization header if available.
 *
 * @param url The URL to fetch.
 * @param options The options for the fetch request.
 * @returns A Promise that resolves to the Response object.
 */
export const fetchWithAuth = async (
  url: string | URL | Request,
  options: FetchOptions = {}
): Promise<Response> => {
  let headers = new Headers(options.headers || {});

  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token) {
      headers.set('Authorization', `Bearer ${session.access_token}`);
    }
  } catch (error) {
    console.warn('Error getting Supabase session for fetchWithAuth:', error);
    // Proceed without auth header if session retrieval fails
  }

  const newOptions: FetchOptions = {
    ...options,
    headers: headers,
  };

  return fetch(url, newOptions);
};

// Example of how to use it (optional, for testing or demonstration)
/*
export const getSomeData = async () => {
  try {
    const response = await fetchWithAuth('/api/some-protected-route');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch some data:", error);
    throw error;
  }
};
*/
