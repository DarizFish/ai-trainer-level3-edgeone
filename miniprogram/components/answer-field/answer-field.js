Component({
  properties:{field:Object,value:{type:String,value:''},checked:{type:String,value:''}},
  methods:{activate(){this.triggerEvent('activate',{index:this.data.field.index});}},
});
