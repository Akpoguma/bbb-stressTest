const puppeteer = require("puppeteer");
const _ = require("lodash/fp");
const username = require("./username");

const initClient = async (
  browser,
  logger,
  joinUrl,
  webcam = true,
  microphone = true
) => {
  const page = await browser.newPage();
  await page.goto(joinUrl);
  const audioAction = microphone ? "Microphone" : "Listen only";
  logger.debug(`waiting for audio prompt ([aria-label="${audioAction}"])`);
  let retryCount = 0;
  while (retryCount < 3) {
    try {
      await page.waitForSelector(`[aria-label="${audioAction}"]`, { timeout: 60000 });
      break; // exit loop if successful
    } catch (err) {
      retryCount++;
      logger.error(`Retry ${retryCount}: Unable to initialize client ${clientsConfig[idx].username} : ${err}`);
      if (retryCount >= 3) throw err; // rethrow after max retries
    }
  }
  
  logger.debug(`click on ${audioAction}`);
  await page.click(`[aria-label="${audioAction}"]`);

  // Removed echo test related code

  await page.waitForSelector(".ReactModal__Overlay", { hidden: true });

  if (microphone) {
    logger.debug("Ensure that we are not muted...");
    // Wait for the toolbar to appear
    await page.waitForSelector('[aria-label="Mute"],[aria-label="Unmute"]');
    // If we are muted, click on Unmute
    const unmuteButton = await page.$('[aria-label="Unmute"]');
    if (unmuteButton !== null) {
      logger.debug("clicking on unmute button");
      await unmuteButton.click();
    }
  }
  if (webcam) {
    await page.waitForSelector('[aria-label="Share webcam"]');
    await page.click('[aria-label="Share webcam"]');
    logger.debug("clicked on sharing webcam");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await page.waitForSelector("#setCam > option");
    await page.waitForSelector('[aria-label="Start sharing"]');
    logger.debug("clicking on start sharing");
    await page.click('[aria-label="Start sharing"]');
  }
  return Promise.resolve(page);
};

const generateClientConfig = (webcam = true, microphone = true) => {
  return {
    username: username.getRandom(),
    webcam,
    microphone,
  };
};

async function start(
  bbbClient,
  logger,
  meetingID,
  testDuration,
  clientWithCamera,
  clientWithMicrophone,
  clientListening
) {
  const [browser, meetingPassword] = await Promise.all([
    puppeteer.launch({
      executablePath: "google-chrome-unstable",
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--mute-audio",
        "--no-sandbox",  // Helps reduce resource usage
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",  // Avoids /dev/shm usage on low-memory systems
        "--disable-gpu",  // Disables GPU hardware acceleration
        "--disable-software-rasterizer",
        "--max-connections-per-server=1000",  // Increases the max connections per server
      ],
    }),
    bbbClient.getModeratorPassword(meetingID),
  ]);

  const clientsConfig = [
    ...[...Array(clientWithCamera)].map(() => generateClientConfig(true, true)),
    ...[...Array(clientWithMicrophone)].map(() =>
      generateClientConfig(true, true)
    ),
    ...[...Array(clientListening)].map(() =>
      generateClientConfig(false, false)
    ),
  ];

  for (let idx = 0; idx < clientsConfig.length; idx++) {
    logger.info(`${clientsConfig[idx].username} join the conference`);
    await initClient(
      browser,
      logger,
      bbbClient.getJoinUrl(
        clientsConfig[idx].username,
        meetingID,
        meetingPassword
      ),
      clientsConfig[idx].webcam,
      clientsConfig[idx].microphone
    ).catch((err) => {
      logger.error(
        `Unable to initialize client ${clientsConfig[idx].username} : ${err}`
      );
      Promise.resolve(null);
    });

    // Add a cooldown of 30 seconds after every batch of 5 clients
    if ((idx + 1) % 2 === 0) {
      logger.info("Cooldown period: Sleeping for 30 seconds...");
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }
  }

  logger.info("All users joined the conference");
  logger.info(`Sleeping ${testDuration}s`);
  await new Promise((resolve) => setTimeout(resolve, testDuration * 1000));
  logger.info("Test finished");
  return browser.close();
}

module.exports = {
  start,
};
