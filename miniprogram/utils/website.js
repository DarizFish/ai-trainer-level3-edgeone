const origin='https://www.aitrainer3.xyz';
function destination(code,executable){
  if(!/^\d+\.\d+\.\d+$/.test(code||''))return origin+'/practical';
  return origin+'/practical/'+encodeURIComponent(code)+(executable?'/lab':'');
}
module.exports={destination};
