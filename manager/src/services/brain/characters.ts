import { character, type SelectCharacter } from "@/schema";
import Poll from "./poll";
import db from "@/db";
import { RANDOM_CHARACTERS } from "@/constants/characters";

const Characters = {
  async init() {
    try {
      const characters = await db.query.character.findMany({
        where: (character, { eq }) => eq(character.why, "random"),
      });

      if (characters.length !== RANDOM_CHARACTERS.length) {
        await db.insert(character).values(RANDOM_CHARACTERS).onConflictDoNothing();
      }
      return characters;
    } catch (e) {
      return null;
    }
  },
  getRandomCharacter(characters: SelectCharacter[]) {
    const randomIndex = Number.parseInt(String(Math.random() * characters.length));

    return characters[Math.max(Math.min(randomIndex, characters.length - 1), 0)];
  },

  async getTodaysCharacter() {
    console.log("Getting Today's Character");
    try {
      const lastWeekPoll = Poll.getLastWeekPoll();
      if (!lastWeekPoll) {
        console.log("No character poll found for last week");
        const characters = await this.init();
        if (!characters) {
          console.error("Characters was null, Ending", { characters });
          return null;
        }

        const randomCharacter = Characters.getRandomCharacter(characters);
        console.log("Found random character", { randomCharacter });
        return randomCharacter;
      }
      const characters = await this.init();
      if (!characters) {
        console.error("Characters was null, Ending", { characters });
        return null;
      }

      const randomCharacter = Characters.getRandomCharacter(characters);
      return randomCharacter;
    } catch (e) {
      console.error("While trying to get today's character a runtime error occurred", { e });
      return null;
    }
  },
};

export default Characters;
