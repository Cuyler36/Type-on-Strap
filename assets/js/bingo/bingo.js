var BINGO = null;
var LARGE_CARD = false;

function Random(seed)
{ this.seed = seed || +new Date(); }

Random.prototype.nextFloat = function()
{ var x = Math.sin(this.seed++) * 10000; return x - Math.floor(x); }

// Box-Muller transform, converts uniform distribution to normal distribution
// depends on uniformity of nextFloat(), which I'm not confident of
Random.prototype.nextGaussian = function()
{
	var u = this.nextFloat(), v = this.nextFloat();
	return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

Random.prototype.nextInt = function(z)
{ return (this.nextFloat() * z)|0; }

Array.prototype.shuffle = function(random)
{
	for (var t, i = 1, j; i < this.length; ++i)
	{
		j = random.nextInt(i);
		t = this[j]; this[j] = this[i]; this[i] = t;
	}

	return this;
}

Array.prototype.clone = function()
{ return this.slice(0); }

Array.prototype.flip = function()
{
	for (var i = 0; i < this.length; ++i)
	{
		var r = this[i], t;
		for (var j = 0, k = r.length - 1; j < k; ++j, --k)
		{ t = r[j]; r[j] = r[k]; r[k] = t; }
	}
}

Array.prototype.rotate = function(n)
{
	var x = this.length, y = this[0].length;
	var rotated = new Array(y);

	for (var i = 0; i < y; ++i)
	{
		var row = rotated[i] = new Array(x);
		for (var j = 0; j < x; ++j)
			rotated[i][j] = this[x-j-1][i];
	}

	return rotated;
}

Array.prototype.bsearch = function(k, f)
{
	f = f || function(z){ return z; };
	var a = 0, b = this.length, x, v;

	while (a + 1 < b)
	{
		v = f( this[x = (a + (b - a) / 2) | 0] );
		if (k == v) return x;
		else k < v ? (b = x) : (a = x + 1);
	}

	// failsafe?
	return a;
}

Array.prototype.contains = function(x)
{ return -1 !== this.indexOf(x); }

function MagicSquare(size, random)
{
	random = this.random = random || new Random(0);

	var square = this.square = new Array();
	for (var x = 0; x < size; ++x)
	{
		var row = this.square[x] = new Array(size);
		for (var y = 0; y < size; ++y) row[y] = 0;
	}

	var x = (size - 1) / 2, y = size - 1, m = size * size;
	for (var k = 0; k < m; ++k)
	{
		square[x++][y++] = k / m;
		x %= size; y %= size;

		if (square[x][y])
		{
			x = (x - 1 + size) % size;
			y = (y - 2 + size) % size;
		}
	}

	for (var rcount = random.nextInt(4); rcount--; )
	{
		square = this.square = square.rotate();
		if (random.nextInt(2)) square.flip();
	}
}

function Bingo(size, seed, difficulty, balance)
{
	this.difficulty = 0;
	if (difficulty && difficulty in Bingo.DIFFICULTY_TABLE)
		this.difficulty = Bingo.DIFFICULTY_TABLE[difficulty];
	
	// random number generator
	this.seed = seed;
	this.random = new Random(seed + this.difficulty);
	this.balanced = balance;

	this.gamedata = null;
	$.getJSON("../../../assets/js/bingo/settings.js", (function(bingo)
	{
		return function(data)
		{
			bingo.processGameData(data);
			bingo.generateBoard();
		}
	})(this)).fail(function(){ console.log(arguments); });

	var board = this.board = [];
	var table = this.table = $("<table id='bingo'>");
	this.size = size;
	
	table.toggleClass('large', LARGE_CARD);

	// make a magic square for the board difficulty
	this.magic = new MagicSquare(size, this.random);

	var i, j, n = 1;

	var header = $("<tr>").appendTo(table);
	for (j = 0; j <= size; ++j)
	{
		var type = j == 0 ? "diag1" : ("col" + j);
		var hdr = $("<td>").attr("data-type", type).addClass("header");
		hdr.text(j == 0 ? "TL-BR" : "COL" + j).appendTo(header);
	}

	var GROUPS = {
		// rows and columns (tags)
		col1: [], col2: [], col3: [], col4: [], col5: [],
		row1: [], row2: [], row3: [], row4: [], row5: [],

		// 2 diagonals
		diag1: [], diag2: [],
	};

	for (i = 1; i <= size; ++i)
	{
		var row = $("<tr>").addClass("row" + i);
		$("<td>").addClass("header").attr("data-type", "row" + i).text("ROW" + i).appendTo(row);
		var brow = [];

		for (j = 1; j <= size; ++j, ++n)
		{
			var _groups = [ GROUPS["col" + j], GROUPS["row" + i] ];
			var cell = $("<td>").addClass("col" + j).addClass("row" + i), c;
			cell.addClass("goal").attr("data-cell", n);

			// add diagonals
			if (i == j) { cell.addClass("diag1"); _groups.push(GROUPS.diag1); }
			if (i + j == size + 1) { cell.addClass("diag2"); _groups.push(GROUPS.diag2); }

			row.append(cell);

			brow.push(c = { cell: cell, goal: null, mod: null, state: 0, groups: _groups });
			cell.data("cell-data", c);
		}

		// add the row to the table
		table.append(row);
		board.push(brow);
	}

	$("<tr>").append($("<td>").text("TR-BL").addClass("header").attr("data-type", "diag2")).appendTo(table);

	// add the table to the screen now
	$("#bingo-container").empty().append(table);
	$("#bingo td.goal").click(function(e)
	{
		var c = $(this).data('cell-data');
		c.state = (c.state + 1) % 3;

		var cell = c.cell;
		cell.removeClass("yes no").addClass([null, "yes", "no"][c.state]);
	});
	
	$("#bingo td.header").hover(
		function() { $("#bingo td.goal." + $(this).attr("data-type")).addClass("hover"); }, 
		function() { $("#bingo td.goal." + $(this).attr("data-type")).removeClass("hover"); }
	)
	.click(function()
	{
		var tds = [];
		$("#bingo td.goal." + $(this).attr("data-type")).each(function(i, x){ tds.push(x); });
		console.log(tds.length, tds);

		var win = window.open('popout.html', '_blank', 'toolbar=no, location=no, directories=no, status=no, '
			+ 'menubar=no, scrollbars=no, resizable=yes, copyhistory=no, width=250, height=550');
		win.addEventListener('load', (function(title, elems)
		{
			return function()
			{
				setTimeout(function()
				{
					var winbody = $(win.document.body);
					$('#bingo th', winbody).text(title).height(25);

					$(elems).each(function(i, x)
					{
						var td = $('<td>').addClass('goal').html($(x).html());
						$('#bingo', winbody).append($('<tr>').append(td));
					});

					var h = win.innerHeight - 100;
					$('#bingo td.goal', winbody).height(h / size);
				}, 500);
			};
		})($(this).text(), tds), false);
	});

	// resize this mess
	var col1w = $('#bingo td.header[data-type="diag1"]').width();
	var sz = ($('#bingo-container').innerWidth() * .9 - col1w) / 5;
	$("#bingo td.goal").outerWidth(sz).outerHeight(sz);
}

Bingo.DIFFICULTY_TABLE = {
	'easy': -1,
	'e': -1,
	'normal': 0,
	'n': 0,
	'hard': 1,
	'h': 1,
	'difficult': 1,
	'd': 1,
};

function difficulty_sort(a, b)
{
	var c = a.difficulty - b.difficulty;
	return c == 0 ? a.id - b.id : c;
}

Bingo.DIFFICULTY_PETURBATION = 0.2;
Bingo.MAXITERATIONS = 200;

Bingo.prototype.generateBoard = function()
{
	var g, gs = this.gamedata.goals.clone(), x;
	var m, ms = this.gamedata.modifiers || {};
	var tagdata = this.gamedata.tags;

	var usedgoals = [];

	var range = this.maxdifficulty - this.mindifficulty;
	for (var i = 0; i < this.size; ++i)
		for (var j = 0; j < this.size; ++j)
		{
			for (var xx = 0;; xx++)
			{
				// failsafe: widen search space after 25 iterations
				var peturbation = this.random.nextGaussian() * Bingo.DIFFICULTY_PETURBATION;
				base = Math.min(Math.max(0.0, this.magic.square[i][j] + peturbation), 1.0);
				var ddiff = xx < 25 ? (base * range) : this.random.nextInt(range);
				
				x = gs.bsearch(ddiff + this.mindifficulty, function(x){ return x.difficulty; });
				if (x >= gs.length) x = gs.length - 1;

				var x1, x2;
				for (x1 = x; x1 > 0             && gs[x1-1].difficulty == gs[x1].difficulty; --x1);
				for (x2 = x; x2 < gs.length - 1 && gs[x2+1].difficulty == gs[x2].difficulty; ++x2);
				x = x1 + this.random.nextInt(x2 - x1);

				g = this.board[i][j].goal = gs[x]; if (!g) continue;
				var vmods = ms["*"] || [], tags = g.tags || [], valid = !usedgoals.contains(g.id);

				var img = null;
				for (var k = 0; k < tags.length; ++k)
				{
					var negated = tags[k].charAt(0) == "-" ? tags[k].substr(1) : ("-" + tags[k]);
					var tdata = tagdata[tags[k]], allowmult = tdata && 
						tdata.allowmultiple !== undefined ? tdata.allowmultiple : false;
						
					// get the image
					if (!img && tags[k].charAt(0) != '-' && tdata && tdata.image) img = tdata.image;
					
					// failsafe: after 50 iterations, don't constrain on allowmultiple tags
					if (xx > 50) allowmult = true;
					
					// failsafe: after 75 iterations, don't constrain on singleuse tags
					if (!(tags[k] in tagdata)) tdata = tagdata[tags[k]] = {};
					if (tdata && tdata.singleuse && tdata['@used'] && xx < 75) valid = false;
					
					for (var z = 0; z < this.board[i][j].groups.length; ++z)
						if ((!allowmult && this.board[i][j].groups[z].contains(tags[k])) ||
							this.board[i][j].groups[z].contains(negated)) valid = false;
				}

				if (valid)
				{
					var cell = this.board[i][j].cell;
					usedgoals.push(g.id);
					if (img) $('<img>').attr('src', img).appendTo(cell);
					for (var k = 0; k < tags.length; ++k) tagdata[tags[k]]['@used'] = true;
					$("<span>").addClass("goaltext").text(g.name).appendTo(cell);
					gs.splice(x, 1); break;
				}
				
				// safety fallout
				if (xx > Bingo.MAXITERATIONS)
				{
					console.log("Could not find a suitable goal for R" + (i+1) + "xC" + (j+1) + " after " + xx + " iterations");
					$("<span>").addClass("goaltext").text("[ERROR]").appendTo(this.board[i][j].cell); break;
				}
			}

			for (var k = 0; k < tags.length; ++k)
			{
				if (tags[k] in ms) vmods = vmods.concat(ms[tags[k]]);
				for (var z = 0; z < this.board[i][j].groups.length; ++z)
					this.board[i][j].groups[z].push(tags[k]);
			}
			vmods.sort(difficulty_sort);

			if (vmods.length && (this.modrequired || this.random.nextFloat() < 0.25))
			{
				this.board[i][j].mod = m = vmods[this.random.nextInt(vmods.length)];
				$("<span>").addClass("modtext").text(m.name).appendTo(this.board[i][j].cell);
			}
		}
}

Bingo.DIFFICULTY_KEEPSIZE = 3/5;
Bingo.prototype.processGameData = function(data)
{
	this.gamedata = data;
	var appname = document.title = data.name + " Bingo";

	if (data.goals.length < 25)
	{
		console.error("25 goals required for a standard 5x5 bingo board");
		return;
	}
	
	for (var i = 0; i < data.goals.length; ++i)
	{
		if (!data.goals[i].distance) data.goals[i].distance = 0;
		data.goals[i].id = i;
	}
	data.goals.sort(difficulty_sort);
	
	var maxdiff = Number.POSITIVE_INFINITY, mindiff = Number.NEGATIVE_INFINITY;
	
	var bdiffa = data.goals[0].difficulty;
	var bdiffb = data.goals[data.goals.length - 1].difficulty - bdiffa;
	
	switch (this.difficulty)
	{
		case -1:
			// EASY: keep only the easiest goals
			if (data.difficulty && data.difficulty.easymax)
				maxdiff = +data.difficulty.easymax;
			else maxdiff = bdiffa + bdiffb * Bingo.DIFFICULTY_KEEPSIZE;
			break;
			
		case 0:
			// NORMAL: check to see if a range is provided
			if (data.difficulty && data.difficulty.normmax)
				maxdiff = +data.difficulty.normmax;
			if (data.difficulty && data.difficulty.normmin)
				mindiff = +data.difficulty.normmin;
			break;
			
		case 1:
			// HARD: keep only the hardest goals
			if (data.difficulty && data.difficulty.hardmin)
				mindiff = +data.difficulty.hardmin;
			else mindiff = bdiffa + bdiffb * (1 - Bingo.DIFFICULTY_KEEPSIZE);
			break;
	}
	
	var i1 = null, i2 = null;
	for (var i = 0; i < data.goals.length; ++i)
	{
		if (data.goals[i].difficulty >= mindiff && i1 == null) i1 = i;
		if (data.goals[i].difficulty >  maxdiff && i2 == null) i2 = i;
	}
	
	if (i1 == null) i1 = 0;
	if (i2 == null) i2 = data.goals.length;
	
	// ensure there are always at least 25 goals
	if (i2 - i1 < 25)
	{
		if (i2 == data.goals.length)
			i1 = data.goals.length - 25;
		else { i1 = 0; i2 = 25; }
	}
	
	data.goals = data.goals.slice(i1, i2);

	this.maxdifficulty = data.goals[data.goals.length - 1].difficulty;
	this.mindifficulty = data.goals[0].difficulty;

	this.modrequired = this.gamedata.modifiers && !!this.gamedata.modifiers['@required'];
	delete this.gamedata.modifiers['@required'];
	$("#game-name").text(data.name);
	
	$('#game-rules').toggle(!!data.rules);
	if (data.rules)
	{
		var rulelist = $('#game-rules ul');
		$('li.game-gen', rulelist).remove();
		for (var i = 0; i < data.rules.length; ++i)
			rulelist.append($('<li>').addClass('game-gen').html(data.rules[i]));
	}
	
	$('#bingo-attrib').toggle(!!data.author);
	if (data.author)
		$('#bingo-author').text(data.author);
}

function regenerateBoard()
{
	var hash = location.hash.slice(1);
	var parts = hash.split("/");
	var seed;
	
	$('#bingo-container').toggleClass('col-md-5', !LARGE_CARD);
	$('#bingo-container').toggleClass('col-md-6',  LARGE_CARD);
	
	$('#about-panel').toggleClass('col-md-5', !LARGE_CARD);
	$('#about-panel').toggleClass('col-md-4',  LARGE_CARD);

	// remove trailing empty hash parts
	while (parts.length && !parts[parts.length - 1]) parts.pop();

	var difficulty = null;
	switch (parts.length)
	{
		case 0:
			break;

		case 1: // #!
			seed = Math.floor(Math.random() * 60466176);
			location.hash = "#!" + "/" + seed.toString(36);
			break;

		case 2: // #!/seed
			seed = parseInt(parts[1].toLowerCase(), 36);
			break;

		case 3: // #!/seed/difficulty
			seed = parseInt(parts[1].toLowerCase(), 36);
			difficulty = parts[2];
			break;
	}

	BINGO = new Bingo(5, seed, difficulty);
}

function setDifficulty(diff)
{
	var size = LARGE_CARD ? "!!" : "!";
	
	// set the location hash properly, everything else should take care of itself
	var lvl = diff && diff.length ? ("/" + diff) : "";
	var seed = Math.floor(Math.random() * 60466176).toString(36);
	location.hash = "#" + size + "/" + seed + lvl;
}

$('button.set-diff').click(function(e) { setDifficulty($(this).attr('data-diff')); });

window.onhashchange = regenerateBoard;
if (location.hash && location.hash.indexOf("#!") === 0)
	regenerateBoard();

function updateBoardSize()
{
	LARGE_CARD = $('#large-card').is(':checked');
	regenerateBoard();
};

$('#large-card').prop('checked', LARGE_CARD).change(updateBoardSize);