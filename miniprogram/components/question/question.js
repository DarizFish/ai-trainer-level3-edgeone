Component({
  properties:{question:{type:Object,value:null},selected:{type:Array,value:[]},revealed:{type:Boolean,value:false}},
  data:{options:[],answerText:'',right:false},
  observers:{'question,selected,revealed':function(q,selected){
    if(!q)return;
    const options=(q.type==='judge'?['正确','错误']:q.options).map((text,i)=>{
      const value=q.type==='judge'?['√','×'][i]:String.fromCharCode(65+i);
      return {text,value,chosen:(selected||[]).includes(value),correct:q.answer.includes(value)};
    });
    this.setData({options,answerText:q.answer.join('、'),right:require('../../utils/exam').correct(q,selected)});
  }},
  methods:{select(event){if(!this.data.revealed)this.triggerEvent('choose',{value:event.currentTarget.dataset.value});}},
});
