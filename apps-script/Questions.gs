/**
 * HistoryMemo question bank: 8 themes × 7 questions, in English, Vietnamese, Japanese.
 * Teochew (teo) has no written prompts: family members record them as audio on the admin page,
 * and the screen shows the question in the storyteller's app language.
 *
 * Vietnamese: {X} / {x} = how the family addresses the storyteller ("Ba", "Mẹ", "Ông"...), capitalised / lower-case.
 */
const THEMES = [
  { name: { en: 'Childhood', vi: 'Tuổi thơ', ja: '子どもの頃' }, q: [
    ['Where were you born? What do you remember about your first home?', '{X} sinh ra ở đâu? Căn nhà đầu tiên {x} nhớ trông như thế nào?', 'どこで生まれましたか？最初の家について何を覚えていますか？'],
    ['What was your favorite game as a child?', 'Hồi nhỏ {x} thích chơi trò gì nhất?', '子どもの頃、一番好きだった遊びは何ですか？'],
    ['What food reminds you most of your childhood?', 'Món ăn nào làm {x} nhớ tuổi thơ nhất?', '子どもの頃を一番思い出す食べ物は何ですか？'],
    ['Tell us about a childhood best friend.', 'Kể về một người bạn thân hồi nhỏ của {x}.', '子どもの頃の親友について教えてください。'],
    ['Did you ever get in trouble as a kid? What happened?', 'Hồi nhỏ {x} có lần nào bị phạt không? Vì chuyện gì?', '子どもの頃、叱られたことはありますか？何があったのですか？'],
    ['What was New Year like when you were young?', 'Ngày Tết hồi nhỏ của {x} như thế nào?', '子どもの頃のお正月はどんなふうでしたか？'],
    ['What childhood memory still makes you smile?', 'Kỷ niệm tuổi thơ nào làm {x} cười mỗi khi nhớ lại?', '今でも思い出すと笑顔になる、子どもの頃の思い出は？'],
  ]},
  { name: { en: 'Family & roots', vi: 'Gia đình & cội nguồn', ja: '家族とルーツ' }, q: [
    ['Tell us about your father.', 'Kể cho con cháu nghe về cha của {x}.', 'お父さんについて話してください。'],
    ['Tell us about your mother.', 'Kể cho con cháu nghe về mẹ của {x}.', 'お母さんについて話してください。'],
    ['Where did your family originally come from? How did they end up where you grew up?', 'Gia đình {x} gốc ở đâu? Vì sao lại đến nơi {x} lớn lên?', 'ご家族はもともとどこの出身ですか？どうして育った土地に来たのですか？'],
    ['How many brothers and sisters did you have? Who were you closest to?', '{X} có mấy anh chị em? Ai thân với {x} nhất?', '兄弟姉妹は何人いましたか？一番仲が良かったのは誰ですか？'],
    ['What language did your family speak at home?', 'Hồi đó trong nhà {x} nói tiếng gì?', '家ではどんな言葉を話していましたか？'],
    ['What lesson from your parents have you always remembered?', 'Cha mẹ đã dạy {x} điều gì mà {x} nhớ mãi?', 'ご両親から教わって、ずっと覚えていることは何ですか？'],
    ['Which family traditions or holidays mattered most in your home?', 'Nhà {x} có truyền thống, ngày lễ nào quan trọng nhất?', '家で一番大切にしていた行事や習わしは何ですか？'],
  ]},
  { name: { en: 'Hometown', vi: 'Quê hương', ja: 'ふるさと' }, q: [
    ['What was special about your hometown?', 'Quê {x} có gì đặc biệt mà nơi khác không có?', 'ふるさとの自慢は何ですか？'],
    ['Describe the road you walked every day back then.', 'Con đường {x} đi mỗi ngày hồi đó trông ra sao?', '当時、毎日歩いた道はどんな道でしたか？'],
    ['What was the market or main street like?', 'Chợ hay phố chính ngày xưa trông thế nào?', '市場や商店街はどんな様子でしたか？'],
    ['What sound or smell reminds you most of home?', '{X} nhớ âm thanh hay mùi vị nào của quê nhất?', 'ふるさとを一番思い出す音や匂いは何ですか？'],
    ['Who were your neighbors?', 'Hàng xóm của {x} hồi đó là những ai?', '近所にはどんな人が住んでいましたか？'],
    ['Is there a dish from home that is hard to find now?', 'Có món ăn quê nhà nào bây giờ khó tìm không?', '今ではなかなか食べられない、ふるさとの料理はありますか？'],
    ['If you could go back for one day, what would you do?', 'Nếu được về quê một ngày, {x} muốn làm gì?', 'ふるさとに一日だけ戻れるなら、何をしたいですか？'],
  ]},
  { name: { en: 'School & youth', vi: 'Học hành & tuổi trẻ', ja: '学校と青春' }, q: [
    ['What do you remember about your first day of school?', 'Ngày đầu tiên đi học của {x} ra sao?', '学校に初めて行った日のことを覚えていますか？'],
    ['Which teacher do you remember most, and why?', 'Thầy cô nào {x} nhớ nhất? Vì sao?', '一番印象に残っている先生は誰ですか？なぜですか？'],
    ['What subject were you best at, and which did you dread?', '{X} giỏi môn gì, sợ môn gì nhất?', '得意な科目と苦手な科目は何でしたか？'],
    ['As a teenager, what did you dream of becoming?', 'Hồi mười mấy tuổi, {x} mơ ước làm nghề gì?', '10代の頃、何になりたいと思っていましたか？'],
    ['What song did you love when you were young? Sing a little of it.', 'Hồi trẻ {x} thích bài hát nào? Hát thử một đoạn nhé.', '若い頃に好きだった歌は何ですか？少し歌ってみてください。'],
    ['What was the boldest thing you did when you were young?', 'Chuyện "liều" nhất {x} từng làm khi còn trẻ là gì?', '若い頃にした一番大胆なことは何ですか？'],
    ['What would you tell your 18-year-old self?', '{X} muốn nói gì với chính mình năm 18 tuổi?', '18歳の自分に何と言ってあげたいですか？'],
  ]},
  { name: { en: 'Work', vi: 'Công việc', ja: '仕事' }, q: [
    ['What was your very first job?', 'Công việc đầu tiên giúp {x} kiếm ra tiền là gì?', '初めての仕事は何でしたか？'],
    ['What did you do with your first paycheck?', 'Đồng lương đầu tiên {x} đã dùng vào việc gì?', '初めてのお給料は何に使いましたか？'],
    ['Which job did you do the longest? Describe a typical day.', 'Công việc nào {x} làm lâu nhất? Kể về một ngày làm việc.', '一番長く続けた仕事は何ですか？ある一日の様子を教えてください。'],
    ['Who helped you most in your working life?', 'Ai là người đã giúp đỡ {x} nhiều nhất trong công việc?', '仕事で一番お世話になった人は誰ですか？'],
    ['When were you proudest of your work?', 'Lúc nào {x} thấy tự hào nhất về công việc của mình?', '仕事で一番誇りに思ったのはどんな時ですか？'],
    ['Was there a failure that taught you a big lesson?', 'Có thất bại nào đã dạy {x} một bài học lớn không?', '大きな教訓になった失敗はありますか？'],
    ['What should the grandchildren know about making a living?', '{X} muốn con cháu biết gì về chuyện làm ăn, kiếm sống?', '生計を立てることについて、孫たちに伝えたいことは何ですか？'],
  ]},
  { name: { en: 'Love & family', vi: 'Tình yêu & gia đình', ja: '恋愛と家庭' }, q: [
    ['Where did you first meet your partner?', '{X} gặp người bạn đời lần đầu ở đâu?', 'パートナーと初めて出会ったのはどこですか？'],
    ['What was your first impression of them?', 'Ấn tượng đầu tiên của {x} về người ấy là gì?', '第一印象はどうでしたか？'],
    ['What was your first date like?', 'Lần hẹn hò đầu tiên diễn ra thế nào?', '初めてのデートはどんな感じでしたか？'],
    ['Tell us about your wedding day.', 'Kể về ngày cưới của {x}.', '結婚式の日のことを話してください。'],
    ['How did you feel when you learned you would become a parent?', 'Lúc biết mình sắp làm cha mẹ, {x} cảm thấy thế nào?', '親になると分かった時、どんな気持ちでしたか？'],
    ['What memory of your children when they were little do you treasure most?', 'Kỷ niệm nào về các con lúc nhỏ làm {x} nhớ nhất?', '子どもたちが小さかった頃の、一番の思い出は何ですか？'],
    ['What is the secret to a happy family?', 'Theo {x}, bí quyết để gia đình êm ấm là gì?', '幸せな家庭の秘訣は何だと思いますか？'],
  ]},
  { name: { en: 'Turning points', vi: 'Những bước ngoặt', ja: '人生の転機' }, q: [
    ['What was the biggest decision of your life?', 'Quyết định lớn nhất trong đời {x} là gì?', '人生で一番大きな決断は何でしたか？'],
    ['Did you ever have to start over from scratch?', 'Có lần nào {x} phải bắt đầu lại từ đầu không?', '一からやり直さなければならなかったことはありますか？'],
    ['In your hardest times, what helped you get through?', 'Lúc khó khăn nhất, điều gì giúp {x} vượt qua?', '一番つらい時、何が支えになりましたか？'],
    ['What is the farthest place you have traveled? How did it feel?', 'Nơi xa nhất {x} từng đến là đâu? Lúc đó {x} thấy thế nào?', '今までで一番遠くへ行った場所はどこですか？どう感じましたか？'],
    ['Who changed the course of your life?', 'Có ai đã làm thay đổi cuộc đời {x} không?', '人生を変えてくれた人はいますか？'],
    ['What exists today that you never could have imagined when you were young?', 'Điều gì hôm nay mà ngày xưa {x} không bao giờ tưởng tượng được?', '若い頃には想像もできなかった、今あるものは何ですか？'],
    ['If you could go back, is there anything you would choose differently?', 'Nếu được quay lại, có điều gì {x} sẽ chọn khác đi không?', 'もし戻れるなら、違う選択をしたいことはありますか？'],
  ]},
  { name: { en: 'For the grandchildren', vi: 'Lời nhắn cho con cháu', ja: '孫たちへ' }, q: [
    ['What do you want the family to always remember about us?', '{X} muốn con cháu nhớ điều gì về gia đình mình?', '家族のことで、いつまでも覚えていてほしいことは何ですか？'],
    ['Teach the grandchildren a few words or sayings in your mother tongue.', 'Dạy con cháu vài câu bằng tiếng mẹ đẻ mà {x} hay nói.', '母国語でよく使う言葉やことわざを、孫たちに教えてください。'],
    ['Which dish should the grandchildren learn to cook? Walk us through it.', 'Món ăn nào {x} muốn con cháu học nấu? Chỉ cách nấu luôn nhé.', '孫たちに作れるようになってほしい料理は何ですか？作り方も教えてください。'],
    ['What tradition do you hope the family keeps?', '{X} mong con cháu giữ gìn truyền thống nào?', '家族に受け継いでほしい伝統は何ですか？'],
    ['What makes you happiest these days?', 'Điều gì làm {x} hạnh phúc nhất bây giờ?', '最近、一番幸せを感じるのはどんな時ですか？'],
    ['Who would you like to thank in your life?', '{X} muốn gửi lời cảm ơn đến ai trong đời?', '人生で「ありがとう」を伝えたい人は誰ですか？'],
    ['Leave a message for the grandchildren to hear one day.', 'Nhắn một lời cho các cháu sau này nghe.', 'いつか孫たちが聞くメッセージを残してください。'],
  ]},
];

/**
 * Life stages: the biography book is ordered from family roots → birth → … → today → messages.
 * Each life question has a default stage (the storyteller can change it after recording).
 */
const LIFE_TOTAL = THEMES.length * 7;         // 56 life questions

const STAGES = ['roots', 'early', 'child', 'youth', 'young', 'middle', 'later', 'now', 'legacy'];
const STAGE_NAME = {
  roots:  { en: 'Family roots',              vi: 'Cội nguồn',                  ja: 'ルーツ' },
  early:  { en: 'Born',                      vi: 'Ra đời',                     ja: '誕生' },
  child:  { en: 'Childhood',                 vi: 'Tuổi thơ',                   ja: '子ども時代' },
  youth:  { en: 'Growing up',                vi: 'Tuổi trẻ',                   ja: '青春' },
  young:  { en: 'Starting out: work & love', vi: 'Lập thân, lập nghiệp, lập gia đình', ja: '社会へ・出会い' },
  middle: { en: 'Building a life',           vi: 'Xây dựng cuộc đời',          ja: '人生を築く' },
  later:  { en: 'Later years',               vi: 'Những năm về sau',           ja: '円熟の日々' },
  now:    { en: 'Today: diary',              vi: 'Hôm nay: nhật ký',           ja: '今：日記' },
  legacy: { en: 'For the grandchildren',     vi: 'Lời nhắn cho con cháu',      ja: '孫たちへ' },
};
// Default stage for each of the 56 life questions (same order as THEMES).
const QUESTION_STAGE = [
  'early', 'child', 'child', 'child', 'child', 'child', 'child',            // Childhood
  'roots', 'roots', 'roots', 'child', 'child', 'child', 'child',            // Family & roots
  'child', 'child', 'child', 'child', 'child', 'child', 'later',            // Hometown
  'child', 'child', 'child', 'youth', 'youth', 'youth', 'youth',            // School & youth
  'young', 'young', 'middle', 'middle', 'middle', 'middle', 'legacy',       // Work
  'young', 'young', 'young', 'young', 'young', 'middle', 'legacy',          // Love & family
  'middle', 'middle', 'middle', 'middle', 'middle', 'now', 'legacy',        // Turning points
  'legacy', 'legacy', 'legacy', 'legacy', 'now', 'legacy', 'legacy',        // For the grandchildren
];

/** After the 56 life questions: an ongoing diary, one short prompt a day (cycles). */
const DIARY = [
  ['What happened today? Tell us about your day.', 'Hôm nay {x} có chuyện gì? Kể về một ngày của {x} đi.', '今日はどんな一日でしたか？'],
  ['What did you eat today? Did it remind you of anything?', 'Hôm nay {x} ăn gì? Món đó có làm {x} nhớ chuyện gì không?', '今日は何を食べましたか？何か思い出すことはありましたか？'],
  ['Who did you talk to today?', 'Hôm nay {x} nói chuyện với ai?', '今日は誰と話しましたか？'],
  ['What made you smile today?', 'Hôm nay điều gì làm {x} vui?', '今日、笑顔になったことは何ですか？'],
  ['What have you been thinking about lately?', 'Dạo này {x} hay nghĩ về chuyện gì?', '最近、よく考えていることは何ですか？'],
  ['Did something today remind you of the old days?', 'Hôm nay có gì làm {x} nhớ chuyện ngày xưa không?', '今日、昔を思い出すことはありましたか？'],
  ['Tell a story you have never told us before.', 'Kể một chuyện {x} chưa từng kể cho con cháu nghe.', 'まだ話したことのないお話をしてください。'],
  ['What is the weather like today? Does it remind you of anything?', 'Hôm nay trời thế nào? Có làm {x} nhớ gì không?', '今日の天気はどうですか？何か思い出しましたか？'],
  ['Is there someone you have been missing lately?', 'Dạo này {x} có nhớ ai không?', '最近、会いたいと思う人はいますか？'],
  ['What advice would you give the family today?', 'Hôm nay {x} muốn dặn dò con cháu điều gì?', '今日、家族に伝えたいことは何ですか？'],
  ['What are you grateful for this week?', 'Tuần này {x} biết ơn điều gì?', '今週、感謝していることは何ですか？'],
  ['Sing or hum a song that is on your mind.', 'Hát hoặc ngâm nga một bài {x} đang nhớ.', '今、頭に浮かぶ歌を歌ってみてください。'],
  ['What did you hear in the news today? What do you think?', 'Hôm nay {x} nghe tin gì? {X} nghĩ sao?', '今日のニュースで気になったことは？どう思いますか？'],
  ['What would you like to do in the coming week?', 'Tuần tới {x} muốn làm gì?', '来週、何をしたいですか？'],
];
const DIARY_STAGE = ['now', 'now', 'now', 'now', 'now', 'later', 'later', 'now', 'now', 'legacy', 'now', 'now', 'now', 'now'];
const DIARY_NAME = { en: 'Diary', vi: 'Nhật ký', ja: '日記' };
