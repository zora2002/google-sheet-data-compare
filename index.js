const fs = require('fs')
const dotenv = require('dotenv')
const { parse } = require('csv-parse')
const axios = require('axios')

dotenv.config()

const SOURCE_CSV_URL = process.env.URL

const TAB_ARRAY = [
  { gid: process.env.TAIPEI_ID, sheetName: 'taipei' },
  { gid: process.env.KAOHSIUNG_ID, sheetName: 'kaohsiung' },
]

const BOTH_WIN_TYPE = {
  'BothSign': 1, // 台北簽售 高雄簽售
  'TaipeiViewKaohsiungSign': 2, // 台北觀禮 高雄簽售
  'TaipeiSignKaohsiungView': 3, // 台北簽售 高雄觀禮
  'BothView': 4 // 台北觀禮 高雄觀禮
}
const SIGN_MAX_NUMBER = 50

const parseOption = {
  delimiter: ',',
  columns: ['num', 'name', 'id'], 
  skip_empty_lines: true,
  cast: (value, context) => {
    let rs = ''
    switch (context.index) {
      case 0:
        rs = value
        break
      case 1:
        // 統一中文姓名隱碼格式
        const firstNameIsOne = value.match(/^\W{1,2}\w$/i)
        const firstNameIsTwo = value.match(/^\W{1,2}\w\W$/i)
        rs = firstNameIsOne || firstNameIsTwo ? value.replace(/\w/i, 'O') : value
        break
      case 2:
        // 統一id隱碼格式
        rs = `${value.slice(0, 2)}***${value.slice(-3)}`
        break
      default:
        break
    }
    return rs
  }
}

async function fetchCsvFromUrl(url) {
  try {
    const res = await axios.get(url)
    return new Promise((resolve, reject) => {
      parse(res.data, parseOption, (err, output) => (err ? reject(err) : resolve(output)))
    })
  } catch (error) {
    throw new Error(`Failed to fetch CSV from ${url}: ${error.message}`);
  }
}

async function getDatas(gid) {
  if (!gid) {
    throw new Error('param of gid on getDatas is missing !')
  }

  try {
    const list = await fetchCsvFromUrl(`${SOURCE_CSV_URL}&gid=${gid}`)
    return list
  } catch (err) {
    console.log(err.message)
  }
}

function writeJsonFile(path, data) {
  fs.access(path, fs.F_OK, (err) => {
    if (err) console.log(`${path} 不存在，即將新增此檔案`)

    fs.writeFile(path, JSON.stringify(data), (err) => {
      if (err) {
        console.log(`${path} 文件寫入失敗 `)
        console.log(err.message)
        return
      }
      console.log(`${path} 文件寫入成功 `)
    })
  })
}

// ----

async function main() {
  let datas = {}
  for (const { gid, sheetName } of TAB_ARRAY) {
    datas[sheetName] = await getDatas(gid)
  }

  let bothWin = []
  datas.taipei.forEach(t => {
    const found = datas.kaohsiung.find(k => k.name === t.name && k.id === t.id)
    found && bothWin.push({
      taipei: t,
      kaohsiung: found
    })
  })
  console.log(`北高皆中獎: ${bothWin.length}位`)
  
  const list = bothWin.map(i => {
    let type = null
    type = i.taipei.num <= SIGN_MAX_NUMBER
      ? (i.kaohsiung.num <= SIGN_MAX_NUMBER ? BOTH_WIN_TYPE.BothSign : BOTH_WIN_TYPE.TaipeiSignKaohsiungView )
      : (i.kaohsiung.num <= SIGN_MAX_NUMBER ? BOTH_WIN_TYPE.TaipeiViewKaohsiungSign : BOTH_WIN_TYPE.BothView )
    return {
      name: i.taipei.name,
      id: i.taipei.id,
      taipeiNum: i.taipei.num,
      kaohsiungNum: i.kaohsiung.num,
      type
    }
  })

  const rs = Array(4).fill().map(() => [])
  list.forEach(i => {
    rs[i.type - 1].push(i)
  })

  rs.forEach((i, index) => {
    const keyArray = Object.keys(BOTH_WIN_TYPE);
    const describe = keyArray[index]
    console.log(`${describe}: ${i.length}位`)
    writeJsonFile(`result/${describe}.json`, i)
  })
}

main()
