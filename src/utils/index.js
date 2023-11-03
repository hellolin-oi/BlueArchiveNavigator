import { openDB } from "idb";
import dayjs from "dayjs";
import NProgress from "nprogress";
import "nprogress/nprogress.css";
import { ImgSource, ImgInfo, ImgAskInfo, ShowImgDialog, ShowAskImgDialog } from "../helpers/image";

const DBName = "BANavDB";
const ServerID = ["日服", "国际服", "国服", "所有区服"]; // JP, Global, CN, All

String.prototype.format = function () {
  let res = this;
  for (let arg in arguments) {
    res = res.replace("{" + arg + "}", arguments[arg]);
  }
  return res;
};
const GetNextBirthday = (birthday) => {
  let curDate = dayjs(),
    nxtDate = dayjs();
  curDate.hour(0).minute(0).second(0).millisecond(0);
  nxtDate.hour(0).minute(0).second(0).millisecond(0);
  nxtDate.month(parseInt(birthday.split("/")[0]) - 1).date(parseInt(birthday.split("/")[1]));
  nxtDate.year(curDate.year() + (nxtDate.month() >= curDate.month() ? 0 : 1));
  return nxtDate;
};
const GetActivitiesFromGameKee = async () => {
  let req = await $.ajax({
    type: "GET",
    url: `https://ba.gamekee.com/v1/activity/query?active_at=${dayjs().unix()}`,
    headers: {
      "game-alias": "ba"
    }
  });
  return req.data;
};
const GetActivitiesFromSchaleDB = async () => {
  let curDate = dayjs(),
    nxtDate = dayjs();
  curDate.hour(0).minute(0).second(0).millisecond(0);
  nxtDate.hour(0).minute(0).second(0).millisecond(0);
  nxtDate.date(curDate.date() + 7);
  let req = await $.ajax({
    type: "GET",
    url: "https://schale.gg/data/zh/students.min.json"
  });
  let res = [];
  req.forEach((s) => {
    if (s.Name.includes("(") || s.Name.includes("（")) return;
    let nxtBirthday = GetNextBirthday(s.BirthDay).unix();
    if (nxtBirthday < nxtDate.unix() && nxtBirthday >= curDate.unix()) res.push(s);
  });
  return res;
};

const SetItemToDB = async (key, data) => {
  const db = await openDB(DBName, 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("main")) {
        // init
        db.createObjectStore("main");
      }
    }
  });
  const obj = db.transaction("main", "readwrite").objectStore("main");
  await obj.put(data, key);
};
const GetItemFromDB = async (key) => {
  const db = await openDB(DBName);
  if (!db.objectStoreNames.contains("main")) {
    // try to get before init
    return undefined;
  }
  return db.transaction("main", "readonly").objectStore("main").get(key);
};
const TryGetItemFromDB = async (key, data) => {
  let res = await GetItemFromDB(key);
  if (res === undefined) {
    await SetItemToDB(key, data);
    res = data;
  }
  return res;
};

const GetTimeRangeString = (st, ed) => {
  // milli
  return dayjs(st).format("MM/DD HH:mm") + " ~ " + dayjs(ed).format("MM/DD HH:mm");
};

const GetActivities = async () => {
  let activity = await GetActivitiesFromGameKee(),
    birthday = await GetActivitiesFromSchaleDB(),
    res = [];
  let curDate = dayjs().valueOf();
  // { name, description, start, end, server, current }
  activity.forEach((e) => {
    let obj = {};
    obj.name = e.title;
    obj.description = e.description;
    obj.start = e.begin_at * 1000;
    obj.end = e.end_at * 1000;
    obj.server = ServerID.findIndex((g) => {
      return g == e.pub_area;
    });
    obj.current = obj.start <= curDate;
    res.push(obj);
  });
  birthday.forEach((e) => {
    let obj = {};
    obj.name = e.Name + " 的生日";
    obj.description = e.FamilyName + " " + e.PersonalName;
    obj.start = GetNextBirthday(e.BirthDay).valueOf();
    obj.end = obj.start + 86399999;
    obj.server = 3;
    obj.current = obj.start <= curDate;
    res.push(obj);
  });
  res.sort((a, b) => {
    return a.start - b.start;
  });
  return res;
};

const GetImageFromArona = async (name) => {
  NProgress.start();

  let req = await $.ajax({
    type: "GET",
    url: `https://arona.diyigemt.com/api/v1/image?name=${name}`
  });

  NProgress.set(0.4);

  if (req.status === 200) {
    // ok
    let localData = await TryGetItemFromDB("image", {}),
      msg = "已通过本地缓存加载。";
    let el = req.data[0];

    NProgress.set(0.6);

    if (localData[el.name] === undefined || localData[el.name].hash !== el.hash) {
      msg = "已通过服务器更新。";
      localData[el.name] = { hash: undefined, img: undefined };

      let newImg = await $.ajax({
        type: "GET",
        url: `https://arona.cdn.diyigemt.com/image${el.path}`,
        cache: false,
        xhr: () => {
          var xhr = new XMLHttpRequest();
          xhr.responseType = "blob";
          return xhr;
        }
      });

      NProgress.set(0.8);

      localData[el.name].hash = el.hash;
      localData[el.name].img = newImg;
    }

    window.URL.revokeObjectURL(localData[el.name].img);
    let res = window.URL.createObjectURL(localData[el.name].img);
    await SetItemToDB("image", localData);

    NProgress.done();
    ImgInfo.value = msg;
    ImgSource.value = res;
    ShowImgDialog();
  } else if (req.status === 101) {
    // fuzzy
    let res = [];

    req.data.forEach((e) => {
      res.push({ name: e.name, url: undefined });
    });

    NProgress.done();
    ImgAskInfo.value = res;
    ShowAskImgDialog();
  } else {
    console.error("API returned unexpected value");
    NProgress.done();
  }
};

var Utils = {
  ServerID,
  SetItemToDB,
  GetItemFromDB,
  TryGetItemFromDB,
  GetTimeRangeString,
  GetActivities,
  GetImageFromArona
};

export default Utils;