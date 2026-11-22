/* سیطره: کدام ردیفِ یک سرزمین، فرمانروایی کدام امپراتوری بر آن است. کلید = حکومتِ محلی، مقدار = امپراتوری (یا چند امپراتوری پشت‌سرهم).
   نوار «زیر فرمان …» فقط در بازهٔ هم‌پوشانی هر دو کشیده می‌شود. */
TL.dominion = {
  // ایرانیان در سرزمین‌های دیگر
  mes_ach: 'achaemenid', ana_ach: 'achaemenid', lev_ach: 'achaemenid', egy_ach1: 'achaemenid', egy_ach2: 'achaemenid',
  ca_ach: 'achaemenid', sa_ach: 'achaemenid', grc_ach: 'achaemenid',
  mes_par: 'parthian',
  mes_sas: 'sasanian', sas_armenia: 'sasanian', lev_sas: 'sasanian', sas_yemen: 'sasanian', egy_sas: 'sasanian', kushanshah: 'sasanian',
  mes_buy: 'buyid', mes_selj: 'seljuk', lev_selj: 'seljuk', mes_ilk: 'ilkhanate', ana_ilk: 'ilkhanate', mes_jal: 'jalayirid',
  mes_qq: 'qara_qoyunlu', mes_aq: 'aq_qoyunlu', mes_saf1: 'safavid', mes_saf2: 'safavid', cau_iran: 'safavid',
  ca_saman: 'samanid', ca_ghaz: 'ghaznavid', sa_ghaz: ['ghaznavid', 'ghurid'], ca_khwar: 'khwarazm', ca_timur: 'timurid',
  // بیگانگان در ایران
  argead: 'alexander', seleucid_ir: 'seleucid', rashidun_ir: 'rashidun', umayyad_ir: 'umayyad', abbasid_ir: 'abbasid', mongol_gov: 'mongol',
  // اسکندر و سلوکیان
  egy_arg: 'alexander', mes_mac: ['alexander', 'seleucid'], ca_sel: 'seleucid',
  // خلافت
  mes_rash: 'rashidun', lev_rash: 'rashidun', egy_rash: 'rashidun',
  mes_umay: 'umayyad', ara_umay: 'umayyad', egy_umay: 'umayyad', andalus_gov: 'umayyad', mag_umay: 'umayyad', ca_arab: ['umayyad', 'abbasid'],
  lev_abb: 'abbasid', ara_abb: 'abbasid', egy_abb: 'abbasid', egy_abb2: 'abbasid',
  lev_fat: 'fatimid', mag_fatimid: 'fatimid', lev_ayy: 'ayyubid', lev_mam: 'mamluk',
  // روم و بیزانس
  ana_roman: ['roman_republic', 'roman_empire'], roman_syria: ['roman_republic', 'roman_empire'], roman_egypt: 'roman_empire',
  roman_greece: ['roman_republic', 'roman_empire'], hispania: ['roman_republic', 'roman_empire'], roman_gaul: ['roman_republic', 'roman_empire'],
  roman_britain: 'roman_empire', rhine_danube: 'roman_empire', roman_africa: ['roman_republic', 'roman_empire', 'western_roman'],
  lev_byz: 'byzantine', egy_byz: 'byzantine', grc_byz: 'byzantine', ita_byz: 'byzantine', mag_byz: 'byzantine',
  // دیگر امپراتوری‌ها
  carthage_ib: 'carthage', ib_almoravid: 'almoravid', ib_almohad: 'almohad', sa_kushan: 'kushan',
  mes_ott1: 'ottoman', mes_ott2: 'ottoman', lev_ott: 'ottoman', ara_ott: 'ottoman', egy_ott: 'ottoman', grc_ott: 'ottoman', mag_ott: 'ottoman',
  tatar_yoke: 'golden_horde', qing_mong: 'qing', napoleonic_ita: 'napoleon_emp',
  iraq_mandate: 'uk', brit_egy: 'uk', raj: 'uk', russian_cau: 'russian_emp', russian_turk: 'russian_emp', soviet_cau: 'ussr', soviet_ca: 'ussr',
  japanese_korea: 'empire_japan', new_spain: 'spain', peru_viceroy: 'spain', brazil_col: 'portugal'
};
