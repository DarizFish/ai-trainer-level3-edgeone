Component({
  properties:{field:Object,value:{type:String,value:''},checked:{type:String,value:''},comparing:Boolean},
  methods:{activate(){this.triggerEvent('activate',{index:this.data.field.index});},compare(){this.triggerEvent('compare',{index:this.data.field.index});}},
});
