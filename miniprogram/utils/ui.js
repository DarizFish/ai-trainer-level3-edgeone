function error(error) {wx.showToast({title:error.message||'操作失败，请重试',icon:'none',duration:3000});}
function choose(question, selected, value) {
  if(question.type!=='multi')return [value];
  return selected.includes(value)?selected.filter(item=>item!==value):selected.concat(value).sort();
}
function confirm(title, content) {return new Promise(resolve=>wx.showModal({title,content,success:r=>resolve(r.confirm),fail:()=>resolve(false)}));}
module.exports={error,choose,confirm};
