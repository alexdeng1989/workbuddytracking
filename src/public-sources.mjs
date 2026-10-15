import * as cheerio from 'cheerio';

// Parse published rule data, never execute the site's JavaScript or inactive UI branches.
export function campusRules(script) {
  const strings='\\[(?:"(?:[^"\\\\]|\\\\.)*"(?:,)?)+\\]';
  const sections=[...script.matchAll(new RegExp(`\\{title:"([^"\\n]+)",items:(${strings})\\}`,'g'))];
  if(sections.length<5||!sections.some(x=>x[1]==='一、活动时间')||!sections.some(x=>x[1]==='四、活动奖励'))throw Error('campus_rules_changed');
  // Only the short rules array begins with this explicit label.
  const start=script.indexOf('["活动时间：');
  const shortRules=start<0?null:script.slice(start).match(new RegExp(`^${strings}`));
  if(!shortRules)throw Error('campus_summary_missing');
  const lines=JSON.parse(shortRules[0]);
  return [...lines,...sections.flatMap(m=>[m[1],...JSON.parse(m[2])])].join('\n');
}

export async function readCampus(raw,url,getText) {
  const $=cheerio.load(raw);
  const src=$('script[src]').map((_,e)=>$(e).attr('src')).get().find(x=>/\/events\/campus-freshman-[\w-]+\.js$/.test(x));
  if(!src)throw Error('campus_entry_missing');
  const asset=new URL(src,url);
  if(asset.protocol!=='https:'||!['download.codebuddy.cn','assets.workbuddy.cn'].includes(asset.hostname))throw Error('campus_asset_unverified');
  const script=await getText(asset.href),text=campusRules(script);
  return {title:$('title').text().trim(),text,material:text,publishedAt:null,updatedAt:null,links:[],linkDates:{},raw:JSON.stringify({html:raw,asset:asset.href,script})};
}

export function parseWechatIndex(raw,url,accountName,cutoff) {
  const $=cheerio.load(raw),title=$('title').text();
  if(/验证码|访问过于频繁|captcha|Access Denied/i.test(title))throw Error('wechat_index_unavailable');
  if(!$('.news-list').length&&!/没有找到|未找到|暂无搜索结果/.test($('body').text()))throw Error('wechat_index_layout_changed');
  const leads=[];
  $('.news-list li').each((_,e)=>{
    const node=$(e),a=node.find('h3 a[href]').first(),account=node.find('.s-p .all-time-y2').text().trim();
    if(account!==accountName)return;
    const epoch=node.find('.s2 script').text().match(/timeConvert\(['"](\d+)['"]\)/)?.[1];
    if(!epoch)return;
    const publishedAt=new Date(Number(epoch)*1000).toISOString();if(publishedAt<cutoff)return;
    const target=new URL(a.attr('href'),url);if(target.hostname!=='weixin.sogou.com'||target.pathname!=='/link')return;
    leads.push({title:a.text().trim(),accountName:account,publishedAt,indexUrl:target.href,snippet:node.find('.txt-info').text().trim(),evidenceLevel:'search_snippet',identityVerified:false});
  });
  return leads;
}
