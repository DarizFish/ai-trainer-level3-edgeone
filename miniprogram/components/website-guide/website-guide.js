const {destination}=require('../../utils/website');
Component({
  properties:{visible:{type:Boolean,value:false},code:{type:String,value:''},executable:{type:Boolean,value:false}},
  data:{url:destination('',false)},
  observers:{'code,executable':function(code,executable){this.setData({url:destination(code,executable)});}},
  methods:{
    close(){this.triggerEvent('close');},
    copy(){wx.setClipboardData({data:destination(this.data.code,this.data.executable),success(){wx.showToast({title:'链接已复制',icon:'success'});},fail(){wx.showToast({title:'复制失败，请重试',icon:'none'});}});},
    swallow(){},
  },
});
