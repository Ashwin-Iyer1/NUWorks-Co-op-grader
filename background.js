const onSendHeadersListener = function(details) {
  if (details.url.includes('northeastern-csm.symplicity.com')) {
    console.log('Symplicity Request Detected:', details.url);
    console.log('Request Headers:', details.requestHeaders);
    if (details.requestHeaders) {
      const cookie = details.requestHeaders.find(
        header => header.name.toLowerCase() === 'cookie'
      );
      const authorization = details.requestHeaders.find(
        header => header.name.toLowerCase() === 'authorization'
      );
      if (cookie) {
        console.log('cookie:', cookie.value);
        chrome.storage.local.set({cookie: cookie.value}, () => {
             console.log("Cookie saved to storage");
        });
      }
      if (authorization) {
        console.log('authorization:', authorization.value);
        
        chrome.storage.local.set({authorization: authorization.value}, () => {
             console.log("Authorization saved to storage");
        });
      }
    }
  }
};

chrome.webRequest.onSendHeaders.addListener(
  onSendHeadersListener,
  {urls: ["https://northeastern-csm.symplicity.com/*"]},
  ["requestHeaders", "extraHeaders"]
);


