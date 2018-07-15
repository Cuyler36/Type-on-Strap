---
layout: post
title: Implementing a Custom Item Name Routine
feature-img: "assets/img/Banner.png"
thumbnail: "assets/img/Banner.png"
tags: [Custom Code, Animal Forest e+, Item Name]
excerpt_separator: <!--more-->
---

Translating Doubutsu no Mori e+ has been fairly easy so far. Even though most text had been reduced in length, almost all messages, choices, and strings were kept in a separate BMG file. Unfortunately, I ran into a problem when I decided it was finally time to translate the item list. In e+, item names had a max length of 10 characters. In Animal Crossing, the max length is 16. Resizing them would have been a simple task, if the item list _wasn't_ inside of forestd.rel (forest data relocation module).
<!--more-->
### `The Plan`
To start off, I attempted to resize the relocation module to allow for the names to be retrieved from there. At the time, I didn't know about the relocation and import tables appended to the end of the file. This failed, and I was greeted by a black screen after the Nintendo logo. I decided to learn more about how the relocation file is structured, and learned that about the relocation and import tables. The import table contains a list of module ids (each rel file has an unique id assigned to it) followed by the location in the relocation table where this module is referred to. The relocation table allows the game to dynamically change instructions/data to fit where it is in memory. With that additional knowledge in hand, I attempted to again resize forestd.rel along with the relocation table. Unfortunately I was once again greeted with a blank screen after the logo.

At this point I decided it was impractical to continue attempts to try and resize forestd.rel. After some contemplation, I realized that I could write my own custom item name retrieval routine. I added a file to forest\_2nd.arc (.arc is an RARC packed archive, sort of like virtual folders) that contained the translated item names at 16 characters a piece. After that, I arrived at the first problem. As it turns out, all the archive files are loaded into the GameCube's _ARAM_ (audio ram). It's not possible to simply address it because it doesn't exist in the same physical address space. To figure out how the game was retrieving NPC messages, I used Dolphin's debugger to trip a breakpoint when "mMsgLoad_get_res" was called. From there, I discovered that through the use of relocation tables, an address was written to two instructions: li and lis (load immediate and load immediate shifted). These two instructions had their operations added together to get the address to the start of msg.bmg in ARAM. Then a function called "GetResourceAram" is called which takes three arguments: the address in ARAM to copy from, the address to copy to in main RAM, and the size in bytes to copy. Knowing this, I came up with the idea of determining the static difference between the address of the function I was overriding (mIN\_copy\_name\_str) and the address of mMsgLoad\_get\_res. I used the instruction lhz (load half word and zero) to load the address to the ARAM start address. This required two calls and an add instruction to get the address.

### `Initial Attempt`
After doing that, I wrote the rest of my routine code. Here's the first version of it:
```nasm
    stwu r1, -0x20(r1) // allocate local variable storage
    mflr r0
    stw r0, 0x24(r1)
    mr r6, r4 // put r4 in r6 just in case
    mr r9, r3 // put address to copy to in r9
    bl GET_PC
    :: GET_PC
    mflr r0 // now we have our pc + 0x14
    li r7, 0x7FFC
    add r7, r7, r0
    lhz r8, 0x7292(r7) // store instruction lower 16 bits r8
    rlwinm r8, r8, 16, 0, 31 // left shift instruction by 16 bits, then and it with mask 0xFFFF0000 (to remove the instruction bits)
    lhz r5, 0x729A(r7) // store lower 16 bit (addi instr)
    add r5, r5, r8 // calculate our offset in r5
    lwz r3, (0)r5 // Load the actual Aram offset in memory
    subis r3, r3, 0xF // -0xF0000
    addi r3, r3, 0x29A0 // add to get the pointer to our file
    cmplwi r6, 0x1000 // compare our id to 0x1000 (start of furniture and all valid ids)
    blt NOT_VALID_ITEM // if less than 0x1000, go here
    cmplwi r6, 0x1FFF // check to see if our item is between 0x1000 and 0x1FFF
    bgt GREATER_THAN_1FFF // if it's greater, then we need to jump to a different location (might be 41A1000C)
    subis r7, r6, 0x1000 // subtract to make our item index start at 0 now
    b GET_FURNITURE_OFFSET
    ::GREATER_THAN_1FFF
    cmplwi r6, 0x2103
    bgt GREATER_THAN_2103
    addi r3, 0x4000
    subis r7, r6, 0x2100
    b GET_OFFSET
    ::GREATER_THAN_2103
    cmplwi r6, 0x2200
    blt NOT_VALID_ITEM
    cmplwi r6, 0x2267
    bgt GREATER_THAN_2267
    addi r3, 0x5040
    subis r7, r6, 0x2200
    b GET_OFFSET
    ::GREATER_THAN_2267
    cmplwi r6, 0x2300
    blt NOT_VALID_ITEM
    cmplwi r6, 0x232F
    bgt GREATER_THAN_232F
    addi r3, 0x560C
    subis r7, r6, 0x2300
    b GET_OFFSET
    ::GREATER_THAN_232F
    cmplwi r6, 0x2400
    blt NOT_VALID_ITEM
    cmplwi r6, 0x2530
    bgt GREATER_THAN_2530
    addi r3, 0x59C0
    subis r7, r6, 0x2500
    b GET_OFFSET
    ::GREATER_THAN_2530
    cmplwi r6, 0x2600
    blt NOT_VALID_ITEM
    cmplwi r6, 0x2644
    bgt GREATER_THAN_2644
    addi r3, 0x6CD0
    subis r7, r6, 0x2600
    b GET_OFFSET
    ::GREATER_THAN_2644
    cmplwi r6, 0x2700
    blt NOT_VALID_ITEM
    cmplwi r6, 0x2744
    bgt GREATER_THAN_2744
    addi r3, 0x7120
    subis r7, r6, 0x2700
    b GET_OFFSET
    ::GREATER_THAN_2744
    cmplwi r6, 0x2800
    blt NOT_VALID_ITEM
    cmplwi r6, 0x2807
    bgt GREATER_THAN_2807
    addi r3, 0x7570
    subis r7, r6, 0x2800
    b GET_OFFSET
    ::GREATER_THAN_2807
    cmplwi r6, 0x2900
    blt NOT_VALID_ITEM
    cmplwi r6, 0x290A
    bgt GREATER_THAN_290A
    addi r3, 0x75F0
    subis r7, r6, 0x2900
    b GET_OFFSET
    ::GREATER_THAN_290A
    cmplwi r6, 0x2A00
    blt NOT_VALID_ITEM
    cmplwi r6, 0x2A8B
    bgt GREATER_THAN_2A8B
    addi r3, 0x076A0
    subis r7, r6, 0x2A80
    b GET_OFFSET
    ::GREATER_THAN_2A8B
    cmplwi r6, 0x2B00
    blt NOT_VALID_ITEM
    cmplwi r6, 0x2B0F
    bgt GREATER_THAN_2B0F
    addi r3, 0x7F60
    subis r7, r6, 0x2B00
    b GET_OFFSET
    ::GREATER_THAN_2B0F
    cmplwi r6, 0x2C00
    blt NOT_VALID_ITEM
    cmplwi r6, 0x2C5F
    bgt GREATER_THAN_2C5F
    addi r3, 0x7000
    addi r3, 0x1060
    subis r7, r6, 0x2C00
    b GET_OFFSET
    ::GREATER_THAN_2C5F
    cmplwi r6, 0x2D00
    blt NOT_VALID_ITEM
    cmplwi r6, 0x2D34
    bgt GREATER_THAN_2D34
    addi r3, 0x7000
    addi r3, 0x1660
    subis r7, r6, 0x2D00
    b GET_OFFSET
    ::GREATER_THAN_2D34
    cmplwi r6, 0x2E00
    blt NOT_VALID_ITEM
    cmplwi r6, 0x2E01
    bgt GREATER_THAN_2E01
    addi r3, 0x7000
    addi r3, 0x19B0
    subis r7, r6, 0x2E00
    b GET_OFFSET
    ::GREATER_THAN_2E01
    cmplwi r6, 0x2F00
    blt NOT_VALID_ITEM
    cmplwi r6, 0x2F03
    bgt GREATER_THAN_2F03
    addi r3, 0x7000
    addi r3, 0x19D0
    subis r7, r6, 0x2F00
    b GET_OFFSET
    ::GREATER_THAN_2F03
    cmplwi r6, 0x3000
    blt NOT_VALID_ITEM
    cmplwi r6, 0x345C
    bgt NOT_VALID_ITEM
    addi r3, 0x7000
    addi r3, 0x1A10
    subis r7, r6, 0x3000
    b GET_FURNITURE_OFFSET
    ::NOT_VALID_ITEM
    li r7, 0x9B80
    b SET_OFFSET
    ::GET_FURNITURE_OFFSET
    srawi r7, r7, 2 // this "divides" our index by four (not really but its the same effect)
    ::GET_OFFSET
    mulli r7, r7, 0x0010 // multiply our value by 16 to get the offset the beginning of the file to the name
    ::SET_OFFSET
    add r3, r3, r7 // add the offset from the start of the section (this should be the pointer to the start of the file at this point)
    ::COPY_NAME
    rlwinm r4, r9, 0, 0, 26 // clear the buffer's lower 5 bits to align it and pass it as an argument
    // TODO: find a way to memcopy the string 8 bytes up to get it in the correct position (if the string is on a non-32 byte aligned number, also account for that.)
    addi r4, r4, 0x20 // add 20 bytes to it to make sure we're not overwriting important memory
    li r5, 0x0020 // load 32 for the size argument
    lis r8, 0x8000
    addi r8, 729C(r8)
    mtctr, r8
    bctr
    lwz r0, 0x24(r1)
    mtlr r0
    addi r1, r1, 0x0020
    blr 
```
There are a couple problems with the code above. Firstly, it went over the 104 instructions that the routine we were replacing had, secondly I didn't realize that GetResourceAram required that the ARAM address and the address to copy to be aligned to 32 bytes. Ultimately this attempt failed and I went back to the drawing board.

### `The Final Version`
Next, I came up with the idea of using a loop to figure out the index based on a separate, smaller file also in forest_2nd.arc. This file has a structure containing three shorts in a row: the beginning of the item type's item index, the end of the item type's index, and the offset into the name file where the first item of that type can be found. After quite a bit of work, I finished a revamped version of the routine:
```nasm
    stwu r1, -0xD0(r1)
    mflr r0
    stw r0, 0xD4(r1)
    lis r20, 0x817F
    addi r20, 0xCF00(r20)
    mr r6, r4
    mr r9, r3
    bl GET_PC
    :: GET_PC
    mflr r0
    li r7, 0x7FFC
    add r7, r7, r0
    lhz r8, 0x728A(r7)
    rlwinm r8, r8, 16, 0, 31
    lhz r5, 0x7292(r7)
    add r5, r5, r8
    lwz r17, (0)r5
    lis r8, 0x8000
    addi r8, 729C(r8)
    cmplwi r6, 0x1000
    stw r6, 0x1C(r1)
    stw r8, 0x20(r1)
    stw r9, 0x24(r1)
    addi r11, r1, 0xD0
    lis r7, 0x800C
    addi r7, 0x10CC
    mtctr r7
    bctr
    blt NOT_VALID_ITEM
    mr r4, r20
    mr r3, r17
    subis r3, r3, 0x000F
    addi r3, r3, 0x2920
    li r5, 0x0080
    mtctr, r8
    bctr
    addi r11, r1, 0xD0
    lis r7, 0x800C
    addi r7, 0x1118
    mtctr r7
    bctr
    lwz r6, 0x1C(r1)
    lwz r8, 0x20(r1)
    lwz r9, 0x24(r1)
    li r7, 0
    ::INDEX_LOOP_START
    add r18, r7, r3
    lhz r10, 0(r18)
    lhz r14, 2(r18)
    lhz r15, 4(r18)
    lhz r16, 6(r18)
    cmplwi r10, 0xFFFF
    beq NOT_VALID_ITEM
    cmplw r6, r14
    ble INDEX_LOOP_END
    cmplw r6, r16
    blt NOT_VALID_ITEM
    addi r7, r7, 6
    b INDEX_LOOP_START
    ::INDEX_LOOP_END
    subf r14, r10, r6
    cmplwi r6, 0x2000
    blt GET_FURNITURE_INDEX
    cmplwi r10, 0x2FFF
    bgt GET_FURNITURE_INDEX
    b GET_INDEX
    ::NOT_VALID_ITEM
    li r15, 0
    li r14, 0x9B80
    b SET_OFFSET
    ::GET_FURNITURE_INDEX
    srawi r14, r14, 2
    ::GET_INDEX
    mulli r14, r14, 0x0010
    ::SET_OFFSET
    mr r3, r17
    subis r3, r3, 0x000F
    addi r3, r3, 0x29A0
    add r3, r3, r15
    add r3, r3, r14
    rlwinm r7, r3, 0, 27, 31
    rlwinm r3, r3, 0, 0, 26
    mr r4, r20
    stw r7, 0x28(r1)
    ::COPY_NAME
    li r5, 0x0020
    mtctr, r8
    bctr
    lwz r6, 0x1C(r1)
    lwz r8, 0x20(r1)
    lwz r9, 0x24(r1)
    lwz r7, 0x28(r1)
    mr r4, r20
    mr r3, r9
    cmplwi r7, 0
    beq MEMCOPY
    addi r4, 0x0010(r4)
    ::MEMCOPY
    li r5, 0x0010
    bl 0x5C64
    addi r11, r1, 0xD0
    lis r7, 0x800C
    addi r7, 0x1118
    mtctr r7
    bctr
    lwz r0, 0xD4(r1)
    mtlr r0
    addi r1, r1, 0x00D0
    blr
```

The result? It worked! Although I now had to adjust all the functions that had 10 set as the character size to 16. This introduced a few bugs due to it overwritting memory needed. Two of these that are known are: The bell sound from Nook when buying/selling bugs out, and the music list is glitched out.

Here's a few screenshots of the translated names:

![Slate Flooring]({{ site.baseurl }}/assets/img/NewItemNameRoutine/slateFlooring.png)
![Blue Bureau]({{ site.baseurl }}/assets/img/NewItemNameRoutine/blueBureau.png)
![Big Dot Shirt]({{ site.baseurl }}/assets/img/NewItemNameRoutine/bigDotShirt.png)

### `Conclusion`
Overall, I'm satisfied with the results. It was many hours of work, as I had to learn PowerPC Assembly and learn how to turn it into it's hex counterpart, but it works! I believe it will be a breeze from here on out.