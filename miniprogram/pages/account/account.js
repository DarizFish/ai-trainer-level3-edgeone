const api=require('../../utils/request');
const study=require('../../utils/study');
Page({
  onShareAppMessage:require('../../utils/share').home,
  data:{mode:'login',email:'',password:'',displayName:'',accepted:false,busy:false,error:''},
  onLoad(options){if(options.mode==='register')this.setData({mode:'register'});},
  input(e){this.setData({[e.currentTarget.dataset.name]:e.detail.value,error:''});},
  switchMode(){this.setData({mode:this.data.mode==='login'?'register':'login',error:''});},
  consent(e){this.setData({accepted:e.detail.value.includes('yes')});},
  privacy(){wx.navigateTo({url:'/pages/privacy/privacy'});},
  async submit(){
    if(this.data.busy)return;
    const {mode,email,password,displayName,accepted}=this.data;
    if(!/^\S+@\S+\.\S+$/.test(email.trim())){this.setData({error:'请输入有效邮箱'});return;}
    if(!password||(mode==='register'&&(password.length<8||password.length>128))){this.setData({error:mode==='register'?'密码需要 8–128 个字符':'请输入密码'});return;}
    if(!accepted){this.setData({error:'请先阅读并同意隐私说明与使用条款'});return;}
    this.setData({busy:true,error:''});
    try{await api.signIn(mode,{email:email.trim(),password,displayName:displayName.trim()});this.setData({password:''});await study.refresh().catch(()=>{});wx.switchTab({url:'/pages/me/me'});}
    catch(error){this.setData({error:error.message});}
    finally{this.setData({busy:false});}
  },
});
