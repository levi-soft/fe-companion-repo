(function(global){
  'use strict';
  const endpoint='https://translate.googleapis.com/translate_a/single';
  const timeoutMs=12000;
  const retryDelayMs=700;

  function translateError(message,code){
    const error=new Error(message);
    error.code=code;
    return error;
  }

  function describeError(error){
    switch(error?.code){
      case 'timeout':return 'Google Translate timed out. Check the device connection.';
      case 'rate-limit':return 'Google is limiting translation requests. Wait a moment and try again.';
      case 'server':return 'Google Translate is unavailable right now. Try again later.';
      case 'http':return 'Google Translate returned HTTP '+error.status+'.';
      case 'format':return 'Google Translate returned an unreadable response.';
      case 'unavailable':return 'This WebView cannot connect to Google Translate.';
      case 'network':return 'Could not connect to Google Translate. Check Internet access and EmuLnk network permission.';
      default:return 'Translation failed: '+(error?.message||'unknown error');
    }
  }
  async function request(text,fetchImpl,targetLanguage='vi'){
    const query='?client=gtx&sl=auto&tl='+encodeURIComponent(targetLanguage)+'&dt=t&q='+encodeURIComponent(text);
    let timer;
    let controller;
    try{if(typeof global.AbortController==='function')controller=new global.AbortController();}catch{}
    const options={method:'GET',mode:'cors',credentials:'omit'};
    if(controller)options.signal=controller.signal;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{if(controller)controller.abort();reject(translateError('Translation request timed out','timeout'));},timeoutMs);});
    try{
      const response=await Promise.race([fetchImpl.call(global,endpoint+query,options),timeout]);
      if(!response.ok){
        const status=Number(response.status)||0;
        if(status===429)throw translateError('Google Translate rate limited the request','rate-limit');
        if(status>=500)throw translateError('Google Translate server error','server');
        const error=translateError('Google Translate HTTP '+status,'http');error.status=status;throw error;
      }
      const payload=await Promise.race([response.json(),timeout]);
      const translated=Array.isArray(payload?.[0])?payload[0].map(part=>typeof part?.[0]==='string'?part[0]:'').join(''):'';
      if(!translated.trim())throw translateError('Google Translate returned no text','format');
      return translated;
    }catch(error){
      if(error?.code)throw error;
      if(error?.name==='AbortError')throw translateError('Translation request timed out','timeout');
      throw translateError(error?.message||'Network request failed','network');
    }finally{clearTimeout(timer);}
  }

  async function translate(text,fetchImpl=global.fetch,targetLanguage='vi'){
    if(typeof text!=='string'||!text.trim())return '';
    if(typeof fetchImpl!=='function')throw translateError('fetch is unavailable','unavailable');
    // FE7 wraps one spoken sentence across multiple visual lines. Keep the
    // display formatting in the UI, but send a continuous sentence to Google.
    text=text.replace(/[\r\n]+/g,' ').replace(/[\t ]+/g,' ').trim();
    let firstError;
    for(let attempt=0;attempt<2;attempt++){
      try{return await request(text,fetchImpl,targetLanguage);}
      catch(error){
        firstError=error;
        if(attempt===0&&(error.code==='network'||error.code==='timeout'||error.code==='server'||error.code==='rate-limit'))await new Promise(resolve=>setTimeout(resolve,retryDelayMs));
        else break;
      }
    }
    throw firstError;
  }

  function formatDialogueSentences(text){
    return String(text||'').replace(/[\r\n]+/g,' ').replace(/[\t ]+/g,' ').trim().replace(/([.!?])\s+(?=\S)/g,'$1\n');
  }

  const api={translate,describeError,formatDialogueSentences};
  global.FE7Translate=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
