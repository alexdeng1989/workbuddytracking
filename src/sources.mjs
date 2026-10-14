export const sources = [
  {id:'official-site', entity:'WorkBuddy', group:'official', channel:'website', url:'https://www.workbuddy.cn/', verified:true},
  {id:'official-product', entity:'腾讯云 WorkBuddy', group:'official', channel:'website', url:'https://cloud.tencent.com/product/workbuddy', verified:true},
  {id:'official-enterprise', entity:'腾讯云 WorkBuddy 企业版', group:'official', channel:'website', url:'https://cloud.tencent.com/product/workbuddy-enterprise', verified:true},
  {id:'official-open', entity:'WorkBuddy 开放平台', group:'official', channel:'website', url:'https://open.workbuddy.cn/', verified:true},
  {id:'official-wecom-admin', entity:'WorkBuddy 企业微信集成', group:'official', channel:'website', url:'https://cloud.tencent.com/document/product/1831/139460', verified:true},
  {id:'official-wecom-mobile', entity:'WorkBuddy 企业微信集成', group:'official', channel:'website', url:'https://cloud.tencent.com/document/product/1831/139458', verified:true},
  {id:'official-campus', entity:'WorkBuddy 校园活动', group:'official', channel:'website', url:'https://www.workbuddy.cn/events/campus-freshman/', verified:true},
  {id:'gemii', entity:'景栗科技', group:'priority', channel:'website', url:'https://www.gemii.cc/', verified:true, mandatory:true},
  {id:'gemii-news', entity:'景栗科技', group:'priority', channel:'website', url:'https://www.gemii.cc/news', verified:true, mandatory:true},
  {id:'lingyi', entity:'零一数科', group:'priority', channel:'website', url:'https://www.lingyishuke.com/', verified:true, mandatory:true, aliases:['零一裂变','哪吒AI运营','运营深度精选']},
  {id:'qdy', entity:'企动云', group:'peer', channel:'website', url:'https://qdy.net.cn/', verified:false},
  {id:'anspire', entity:'安思派', group:'peer', channel:'website', url:'https://anspire.cn/news/workbuddy-provider-classification/', verified:false},
  {id:'tongze', entity:'同泽', group:'peer', channel:'website', url:'https://workbuddycc.com/', verified:false},
  {id:'gemii-video', entity:'景栗科技', group:'priority', channel:'video', mandatory:true, verified:false, accountName:null, accountId:null, note:'准确账号及主体对应关系待核验'},
  {id:'lingyi-video', entity:'零一数科', group:'priority', channel:'video', mandatory:true, verified:true, accountName:'运营深度精选', accountId:null, identityEvidence:'https://www.lingyishuke.com/', note:'官网关联名称已核验；平台账号 ID、数据覆盖待核验'},
  {id:'official-video', entity:'WorkBuddy 官方', group:'official', channel:'video', verified:false, accountId:null, note:'官方视频号主体和账号 ID 待核验'},
  {id:'official-wechat', entity:'WorkBuddy 官方', group:'official', channel:'wechat', verified:false, note:'官方公众号主体和文章入口待核验'},
  {id:'gemii-wechat', entity:'景栗科技', group:'priority', channel:'wechat', mandatory:true, verified:true, identityEvidence:'https://www.gemii.cc/imagehome/image12.png', accountQrUrl:'http://weixin.qq.com/r/Rz81LUfEwRq_rQNO92pV', note:'官网公众号二维码已核验；平台账号 ID 和文章入口待接通'},
  {id:'lingyi-wechat', entity:'零一数科', group:'priority', channel:'wechat', mandatory:true, verified:true, accountName:'零一数科', identityEvidence:'https://www.lingyishuke.com/brand/qrcode-official.png', accountQrUrl:'http://weixin.qq.com/r/mp/BRxXTyLEoH-frWYs90kX', note:'官网关联名称与二维码已核验；文章入口待接通'},
  {id:'discovery', entity:'全国同行发现', group:'discovery', channel:'search', verified:false}
];
export const labels = {ok:'检查成功', no_new:'未发现新增', changed:'发现变化，待事实核验', failed:'检查失败', unavailable:'内容不可访问', unconfigured:'尚未接通', partial:'部分完成'};
